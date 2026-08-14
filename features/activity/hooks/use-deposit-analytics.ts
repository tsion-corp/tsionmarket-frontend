"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/mixpanel";
import { newDepositArrivals, rememberArrivals } from "@/lib/analytics/deposit-watch";
import type { ActivityItem } from "@/lib/server/activity";

const STORAGE_KEY = "wsws.analytics.reported-deposits.v1";

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
 * Reports `deposit_completed` when a deposit settles into the user's wallet.
 *
 * A settled deposit shows up as an inbound stablecoin transfer in activity,
 * which is the only part of that flow the client can see: the money is sent
 * from somewhere else, to a static address, usually while the app is closed.
 *
 * The first run on a device records what is already there without reporting
 * it. Without that, a returning user's whole history would be replayed into
 * Mixpanel as deposits that happened today.
 */
export function useDepositAnalytics(items: ActivityItem[]): void {
  const seeded = useRef(false);

  useEffect(() => {
    if (items.length === 0) return;

    const seen = readSeen();
    const arrivals = newDepositArrivals(items, seen);
    if (arrivals.length === 0) return;

    const isFirstRun = !seeded.current && seen.size === 0;
    seeded.current = true;

    if (!isFirstRun) {
      for (const arrival of arrivals) {
        track("deposit_completed", {
          method: "crypto",
          // The network it settled on. The chain the user sent from is not
          // recoverable from the arrival; `deposit_network_selected` carries
          // that, earlier in the same funnel.
          source_network: arrival.network,
          amount_usd: arrival.amountUsd,
        });
      }
    }

    writeSeen(
      rememberArrivals(
        seen,
        arrivals.map((a) => a.id)
      )
    );
  }, [items]);
}
