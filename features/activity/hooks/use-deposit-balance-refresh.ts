"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import {
  depositCandidateIds,
  newDepositArrivals,
  rememberArrivals,
} from "@/lib/analytics/deposit-watch";
import { readSelfInitiated } from "@/lib/analytics/self-initiated";
import type { ActivityItem } from "@/lib/server/activity";

// Its own remembered-set, separate from the analytics one: the two answer
// different questions (has this been reported / has the balance accounted for
// it) and must not consume each other's arrivals.
const STORAGE_KEY = "wsws.balance.deposit-seen.v1";

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    // A corrupt or unavailable store must not stop the app; the cost is that
    // this device re-seeds and skips one refresh.
    return new Set();
  }
}

function writeSeen(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or a full quota: without a store we cannot dedup, so we stay
    // quiet rather than refetch on every poll.
  }
}

/**
 * Re-reads the wallet balance once when a deposit settles into it.
 *
 * The balance is cache-first (see hooks/use-portfolio.ts): it does not poll, so
 * money arriving from outside the app — a crypto or bank deposit landing at the
 * static address while the app is closed — would otherwise not show until the
 * next in-app transaction. A settled deposit surfaces as an inbound stablecoin
 * transfer in activity (lib/analytics/deposit-watch.ts); that is the signal used
 * here to refresh the network it landed on, exactly once per arrival.
 *
 * The first run on a device records what is already there without refreshing:
 * those arrivals are already in the balance on screen, and re-reading the whole
 * history is the polling this change exists to remove. Genuinely new arrivals on
 * later runs — including ones that landed while away, since the remembered set
 * persists — do refresh.
 */
export function useDepositBalanceRefresh(items: ActivityItem[], wallet: string): void {
  const { refetchFresh } = usePortfolio();
  const seeded = useRef(false);

  useEffect(() => {
    if (!wallet || items.length === 0) return;

    const seen = readSeen();
    // Transfers the app itself caused are not deposits, however much they look
    // like one once the money lands. See lib/analytics/self-initiated.
    const arrivals = newDepositArrivals(items, seen, readSelfInitiated());
    const considered = depositCandidateIds(items).filter((id) => !seen.has(id));
    if (considered.length === 0) return;

    const isFirstRun = !seeded.current && seen.size === 0;
    seeded.current = true;

    // A genuinely new arrival the cached balance hasn't accounted for: re-read
    // only the network(s) it settled on, not every chain.
    if (!isFirstRun && arrivals.length > 0) {
      const networks = [...new Set(arrivals.map((arrival) => arrival.network))];
      void refetchFresh(networks);
    }

    writeSeen(rememberArrivals(seen, considered));
  }, [items, wallet, refetchFresh]);
}
