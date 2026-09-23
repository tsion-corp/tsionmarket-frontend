"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/mixpanel";
import { insertIdFor } from "@/lib/analytics/insert-id";
import {
  depositCandidateIds,
  newDepositArrivals,
  rememberArrivals,
} from "@/lib/analytics/deposit-watch";
import { readSelfInitiated } from "@/lib/analytics/self-initiated";
import { claimOnrampWatch, hasOpenOnrampWatch } from "@/lib/ramping/onramp-watch";
import type { ActivityItem } from "@/lib/server/activity";

const STORAGE_KEY = "wsws.analytics.reported-deposits.v1";

// How far back a device's first run reports. Mixpanel's browser endpoint
// refuses an event more than five days old, so four keeps well inside it.
const FIRST_RUN_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    // A corrupt or unavailable store must not stop the app; the cost is that
    // this device re-seeds and stays silent for one visit.
    return new Set();
  }
}

function writeSeen(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or a full quota. Nothing to do: without a store we cannot
    // promise once-only reporting, so we stay quiet rather than double-count.
  }
}

/**
 * Reports `deposit_completed` when a deposit settles into the user's wallet,
 * on either rail.
 *
 * A settled deposit shows up as an inbound stablecoin transfer in activity,
 * which is the only part of that flow the client can see: the money is sent
 * from somewhere else, to a static address, usually while the app is closed.
 * That is as true of a Naira transfer as of a chain one, because user funds are
 * held in Base USDC and the rail credits them the same way. Nothing about the
 * arrival says which rail paid for it, so `wallet`'s open bank deposits are
 * what names it. See lib/ramping/onramp-watch.
 *
 * This is the only place `deposit_completed` is sent. The bank rail used to
 * have an event of its own, fired from the transfer screen, and every Naira
 * deposit produced both: the same money counted twice in the dollar totals.
 *
 * The first run on a device records what is already there without reporting
 * it. Without that, a returning user's whole history would be replayed into
 * Mixpanel as deposits that happened today.
 */
export function useDepositAnalytics(items: ActivityItem[], wallet: string): void {
  const seeded = useRef(false);

  useEffect(() => {
    if (items.length === 0) return;

    const seen = readSeen();
    // Transfers the app itself caused are not deposits, however much they look
    // like one once the money lands. See lib/analytics/self-initiated.
    const arrivals = newDepositArrivals(items, seen, readSelfInitiated());
    const considered = depositCandidateIds(items).filter((id) => !seen.has(id));
    if (considered.length === 0) return;

    const isFirstRun = !seeded.current && seen.size === 0;
    seeded.current = true;

    // Arrivals held back this pass: a bank deposit is still in flight and one
    // of them may be it. They stay unrecorded so the next poll reconsiders
    // them, by which time the rail has usually reported.
    const held = new Set<string>();

    const now = Date.now();
    // A device's first run reports only what arrived recently. Older arrivals
    // are history: replaying them would report a returning user's past
    // deposits as new. Recent ones are reported, because a new account's first
    // deposit is exactly what sits in activity the first time this runs, and a
    // silent first run is what used to drop it. The same deposit reported by
    // another device dedupes on its $insert_id and time.
    const reportable = isFirstRun
      ? arrivals.filter((arrival) => now - arrival.timestamp <= FIRST_RUN_WINDOW_MS)
      : arrivals;

    for (const arrival of reportable) {
      const time = Math.floor(arrival.timestamp / 1000);
      // Claiming removes the deposit it matched, so two arrivals cannot be
      // attributed to the same transfer.
      const bank = claimOnrampWatch(wallet, arrival.amountUsd, now);
      if (bank) {
        track("bank_transfer_completed", {
          amount_usd: arrival.amountUsd,
          ...bank,
          tx_hash: arrival.hash,
          time,
          $insert_id: insertIdFor("bank_transfer_completed", arrival.id),
        });
        continue;
      }
      if (hasOpenOnrampWatch(wallet, now)) {
        // Calling this crypto now cannot be taken back if the rail reports it
        // as the bank deposit a moment later, and a wrong rail is the defect
        // this whole path exists to fix. Waiting costs one poll.
        held.add(arrival.id);
        continue;
      }
      track("deposit_completed", {
        // The network it settled on. The chain the user sent from is not
        // recoverable from the arrival; `deposit_network_selected` carries
        // that, earlier in the same funnel.
        network: arrival.network,
        asset: arrival.asset,
        amount_usd: arrival.amountUsd,
        tx_hash: arrival.hash,
        time,
        $insert_id: insertIdFor("deposit_completed", arrival.id),
      });
    }

    // Remember everything considered, not just what was reported, so a
    // self-caused arrival stays ruled out on later visits. What was held back
    // is deliberately not remembered: it has not been reported yet.
    writeSeen(
      rememberArrivals(
        seen,
        considered.filter((id) => !held.has(id))
      )
    );
  }, [items, wallet]);
}
