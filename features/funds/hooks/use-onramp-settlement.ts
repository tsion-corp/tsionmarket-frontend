"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRampOrder } from "@/hooks/use-ramping";
import { track } from "@/lib/analytics/mixpanel";
import { getWalletAddress } from "@/lib/user";
import type { OnrampOrder } from "@/lib/ramping/orders";
import {
  closeOnrampWatch,
  onrampWatches,
  pruneOnrampWatches,
  serverOnrampWatches,
  settleOnrampWatch,
  subscribeOnrampWatches,
} from "@/lib/ramping/onramp-watch";

// How often an open order is checked. The rail settles within seconds of the
// bank credit, and the arrival it produces is only noticed on the activity
// poll a minute later, so this is comfortably ahead of the thing it informs.
const POLL_MS = 15_000;

// Aged-out entries are dropped on this beat, so an abandoned deposit stops
// holding arrivals back. Only runs while there is something stored.
const PRUNE_MS = 60_000;

/**
 * Follows a bank deposit to settlement and records what the rail actually
 * moved, so the deposit watcher can name the rail when the money lands.
 *
 * This reports nothing itself. `deposit_completed` fires once, from the
 * arrival, which is the moment the money is genuinely in the user's balance;
 * all this does is make sure the figures are there to describe it with.
 *
 * Mounted app-wide rather than inside the transfer screen. That screen is
 * unmounted the moment the funds sheet closes, which is why the bank rail used
 * to lose every deposit where the user paid and walked away.
 */
export function useOnrampSettlement(): void {
  const { user } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum")?.toLowerCase() ?? "";

  const watches = useSyncExternalStore(subscribeOnrampWatches, onrampWatches, serverOnrampWatches);

  // The order worth polling: this wallet's newest fresh order that the rail has
  // not reported on yet. A reused account is skipped deliberately, because its
  // order completed on an earlier deposit and the rail never moves it again;
  // those are matched from the quote instead. See lib/ramping/onramp-watch.
  //
  // Nothing is filtered by age here. Age is a clock reading, which render may
  // not take; the prune below drops what has expired, and dropping it is what
  // takes it out of this list.
  const target = useMemo(
    () =>
      watches
        .filter((w) => w.wallet === wallet && !w.reused && w.orderId && w.settledUsd == null)
        .sort((a, b) => b.openedAt - a.openedAt)[0] ?? null,
    [watches, wallet]
  );

  const query = useRampOrder("onramp", target?.orderId ?? null, {
    enabled: Boolean(target),
    pollMs: POLL_MS,
  });

  // Orders already reported as failed. The poll stops on a terminal status and
  // the entry is dropped either way, but an effect can run again before either
  // takes hold, and a failure counted twice is a failure rate that is wrong.
  const reportedFailed = useRef(new Set<string>());

  const order = query.data as OnrampOrder | undefined;
  useEffect(() => {
    if (!target || !order) return;
    if (order.status === "completed") {
      const usd = Number(order.amountUsdc);
      const ngn = Number(order.amountNgn);
      // Only the rail's own figures are worth storing. Without them the entry
      // stays an expectation, which the arrival can still be matched against.
      if (usd > 0 && ngn > 0)
        settleOnrampWatch(target.orderId, { amountNgn: ngn, amountUsd: usd }, Date.now());
      return;
    }
    // A failed order delivered nothing, so there is no arrival to explain and
    // holding later ones back would be wrong. An expired one is kept: its
    // account stays payable and a transfer made after the lock still lands.
    if (order.status !== "failed") return;
    if (!reportedFailed.current.has(target.orderId)) {
      reportedFailed.current.add(target.orderId);
      // "failed" is the rail's own word for a transfer it could not deliver,
      // and it is a different status from the lapsed rate lock it calls
      // "expired". Only the first is a deposit that went wrong; reporting the
      // second would count every abandoned quote as a failure.
      track("deposit_failed", { method: "bank", reason: "rail_rejected" });
    }
    closeOnrampWatch(target.orderId, Date.now());
  }, [target, order]);

  // Drop what has aged out, on mount and on a slow beat. An abandoned deposit
  // that stayed stored would keep holding arrivals back in the deposit watcher.
  useEffect(() => {
    if (watches.length === 0) return;
    pruneOnrampWatches(Date.now());
    const id = setInterval(() => pruneOnrampWatches(Date.now()), PRUNE_MS);
    return () => clearInterval(id);
  }, [watches.length]);
}
