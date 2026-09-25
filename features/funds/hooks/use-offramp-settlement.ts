"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useRampOrder } from "@/hooks/use-ramping";
import { track } from "@/lib/analytics/mixpanel";
import { insertIdFor } from "@/lib/analytics/insert-id";
import {
  closeOfframpWatch,
  offrampWatches,
  serverOfframpWatches,
  subscribeOfframpWatches,
} from "@/lib/ramping/offramp-watch";
import type { OfframpOrder } from "@/lib/ramping/orders";

/**
 * Follows this device's open bank withdrawals to their end, and reports it.
 *
 * The withdraw screen used to report the payout itself, which counted it only
 * if the screen was still open when the rail finished. This runs on every
 * signed-in page instead. It is the only place withdraw_completed is sent for
 * the bank rail, so a payout is never reported twice.
 */
export function useOfframpSettlement(): void {
  const { evmAddress } = useAuthSession();
  const wallet = (evmAddress ?? "").toLowerCase();
  const watches = useSyncExternalStore(
    subscribeOfframpWatches,
    offrampWatches,
    serverOfframpWatches
  );

  // The newest open withdrawal for this wallet. One at a time: withdrawals
  // are placed one after another, and the next is followed once this ends.
  const target = useMemo(
    () =>
      watches.filter((w) => w.wallet === wallet).sort((a, b) => b.openedAt - a.openedAt)[0] ?? null,
    [watches, wallet]
  );

  const query = useRampOrder("offramp", target?.orderId ?? null, { enabled: Boolean(target) });
  const order = query.data as OfframpOrder | undefined;

  // An effect can run again before the watch is closed; a payout reported
  // twice is revenue counted twice.
  const reported = useRef(new Set<string>());

  useEffect(() => {
    if (!target || !order || order.id !== target.orderId) return;
    if (reported.current.has(target.orderId)) return;

    if (order.status === "completed") {
      // Only the rail's own figures. A guessed Naira amount on a money event
      // is worse than a late one, so without them this waits for a later poll.
      const usd = Number(order.amountUsdc);
      const rate = Number(order.rate);
      const ngn = Number(order.amountNgn) || (rate > 0 && usd > 0 ? usd * rate : 0);
      if (!(usd > 0) || !(ngn > 0)) return;
      reported.current.add(target.orderId);
      track("withdraw_completed", {
        method: "bank",
        asset: "USDC",
        amount_usd: usd,
        // The net Naira that reached the account, and the rate the two legs
        // imply, so amount_ngn / fx_rate is always amount_usd.
        amount_ngn: ngn,
        fx_rate: Math.round((ngn / usd) * 100) / 100,
        bank: target.bank,
        order_id: target.orderId,
        $insert_id: insertIdFor("withdraw_completed", target.orderId),
      });
      closeOfframpWatch(target.orderId, Date.now());
      return;
    }

    if (order.status === "failed") {
      reported.current.add(target.orderId);
      track("withdraw_failed", {
        method: "bank",
        reason: "rail_rejected",
        amount_usd: target.amountUsd,
        order_id: target.orderId,
      });
      closeOfframpWatch(target.orderId, Date.now());
    }
  }, [target, order]);
}
