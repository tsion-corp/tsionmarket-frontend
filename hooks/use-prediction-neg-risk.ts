"use client";

import { useQuery } from "@tanstack/react-query";
import { readGroupOfMarket, readRedeemableAt } from "@/lib/prediction/chain-reads";

// Contract v1.2.0 state that the read-model does not carry yet: whether a market
// belongs to a neg-risk group, and when a resolved market's winnings unlock.
// Both come straight from the chain, so they are right the moment a transaction
// lands rather than after the indexer catches up.

// Neither value changes often. The group a market belongs to is fixed once
// registered; the challenge deadline is set at resolution. Cache accordingly and
// let a refetch on mount pick up the rare change.
const STALE_MS = 60_000;

// The on-chain group id for a market, or null when it is standalone. Null is
// also the answer while the read is in flight or if it fails, which is the safe
// default: callers use it to decide whether to HIDE a per-market resolve, and a
// failed read should not hide a control the creator legitimately has.
export function useMarketGroupId(marketId: bigint | null) {
  return useQuery({
    queryKey: ["prediction", "groupOfMarket", marketId?.toString() ?? null],
    queryFn: async () => {
      const id = await readGroupOfMarket(marketId as bigint);
      return id === 0n ? null : id;
    },
    enabled: marketId != null,
    staleTime: STALE_MS,
  });
}

// Unix seconds after which a resolved market may be redeemed, or 0 for "now".
// Redeeming inside the window reverts with "challenge window", so the claim UI
// reads this before offering the button.
export function useRedeemableAt(marketId: bigint | null) {
  return useQuery({
    queryKey: ["prediction", "redeemableAt", marketId?.toString() ?? null],
    queryFn: () => readRedeemableAt(marketId as bigint),
    enabled: marketId != null,
    staleTime: STALE_MS,
  });
}
