"use client";

import { useQueryClient } from "@tanstack/react-query";
import { markKashSyncing } from "@/hooks/use-kash-sync";

/** When to re-check balances after a chain write, in ms. */
const CHAIN_SETTLE_RETRIES_MS = [2500, 6000];

/**
 * Refresh every Kash read.
 *
 * Lives here, below the feature line, because both `features/portfolio`
 * (Kash's own claim/convert/purchase/subscribe mutations) and
 * `features/trade` (spot and perps trades, which earn Kash points on their
 * platform fee) need to trigger it, and features never import each other.
 *
 * Not every balance-changing action is a mutation that can call this
 * directly: a KSH send is a raw on-chain transfer, and a trade's points only
 * land once the owning service's worker processes the fill and publishes
 * `platform.revenue.recorded` — callers invoke this once they know a
 * points-earning action has gone through, best-effort, same as everywhere
 * else it's already used.
 */
export function useInvalidateKash() {
  const queryClient = useQueryClient();
  return () => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["kash"] });
    refresh();
    // Hold the "syncing" state open across the whole settle window, so the card
    // shows the numbers are catching up rather than presenting a stale figure
    // as final.
    markKashSyncing(CHAIN_SETTLE_RETRIES_MS[CHAIN_SETTLE_RETRIES_MS.length - 1] ?? 0);
    // A mint, burn, or fee-triggered reward is confirmed by the time a
    // mutation resolves, but the RPC replica the engine reads its balances
    // from can still be a block behind. Refetching once more shortly after is
    // what stops a successful action from appearing to have done nothing.
    CHAIN_SETTLE_RETRIES_MS.forEach((delay) => setTimeout(refresh, delay));
  };
}
