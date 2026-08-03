"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useActivity, type ActivityEntry } from "@/hooks/use-activity";
import { formatQty } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { ActivityKind } from "@/lib/activity/entries";

// A trade names itself; a plain movement still needs its network, since the
// same asset can arrive on more than one.
const TOAST_KEY: Record<ActivityKind, string> = {
  bought: "toastBought",
  sold: "toastSold",
  swapped: "toastBought",
  deposited: "toastDeposited",
  withdrew: "toastWithdrew",
  moved: "toastMoved",
  received: "toastReceived",
  sent: "toastSent",
};

// Transfers that land while the app is open — including ones this app did not
// initiate, like a deposit sent from an exchange — get a toast. The per-flow
// toasts only cover an action the user completed on-screen, so without this a
// deposit arriving on another page or from outside goes unannounced.

const SEEN_KEY = "wsws.activity-seen.v1";
// Keep the list bounded; older ids can never toast again anyway once they fall
// outside the freshness window below.
const SEEN_LIMIT = 200;
// Only announce something that just happened. A backfill, a slow first load or
// a newly connected wallet must not replay its whole history as toasts.
const FRESH_MS = 30 * 60_000;
// A burst (a swap's several transfers) should inform, not bury the screen.
const MAX_PER_TICK = 3;

const NETWORK_LABEL: Record<string, string> = {
  "base-mainnet": "Base",
  "eth-mainnet": "Ethereum",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_LIMIT)));
  } catch {
    // Losing the record only risks a repeat toast, never a wrong one.
  }
}

export function useActivityNotifications(): void {
  const t = useTranslations("activity");
  const { items } = useActivity();
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    // First run seeds from storage and marks everything already present, so
    // opening the app never toasts history.
    if (seenRef.current === null) {
      const seen = loadSeen();
      for (const item of items) seen.add(item.id);
      saveSeen(seen);
      seenRef.current = seen;
      return;
    }

    const seen = seenRef.current;
    const fresh: ActivityEntry[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.timestamp > 0 && Date.now() - item.timestamp < FRESH_MS) fresh.push(item);
    }
    if (fresh.length === 0) return;
    saveSeen(seen);

    for (const item of fresh.slice(0, MAX_PER_TICK)) {
      const params = {
        amount: formatQty(item.amount),
        symbol: item.symbol,
        network: NETWORK_LABEL[item.network] ?? item.network,
      };
      // The same verb the row uses, so a toast and the history agree.
      const message = t(TOAST_KEY[item.kind], params);
      // Keyed by the transfer so a re-render can never double-toast it.
      toast.success(message, { id: `activity:${item.id}` });
    }
  }, [items, t]);
}
