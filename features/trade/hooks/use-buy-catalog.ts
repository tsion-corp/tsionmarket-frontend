"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";
import { BUY_ORIGIN, toBuyRoutes, type BuyRoute } from "@/lib/buy";

const ONE_HOUR = 60 * 60 * 1000;

// The buyable catalog barely changes and is persisted to localStorage, so keep
// it a day in memory, never refetch on focus or remount, and rehydrate it
// instantly on the next visit. Mirrors the deposit catalog options.
const CATALOG_OPTIONS = {
  staleTime: ONE_HOUR,
  gcTime: PERSISTED_GC_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

// Origin is fixed to USDC on Base, so the buyable set is the destinations
// Dextopus can deliver that origin to. Keyed by origin so a future origin change
// gets its own cache entry.
export const BUY_DESTINATIONS_KEY = [
  "buy-destinations",
  BUY_ORIGIN.chainId,
  BUY_ORIGIN.asset,
] as const;

export async function fetchBuyDestinations(): Promise<BuyRoute[]> {
  const params = new URLSearchParams({
    originChainId: String(BUY_ORIGIN.chainId),
    originAddress: BUY_ORIGIN.asset,
  });
  const res = await apiFetch(`/api/dextopus/trade/deposit/destinations?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Couldn't load buyable assets");
  return toBuyRoutes(data);
}

// The set of assets a user can buy with USDC on Base, as Dextopus destination
// routes. Drives the markets-table filter and the buy sheet's chain choices.
export function useBuyDestinations(enabled = true) {
  return useQuery<BuyRoute[]>({
    queryKey: BUY_DESTINATIONS_KEY,
    ...CATALOG_OPTIONS,
    queryFn: fetchBuyDestinations,
    enabled,
  });
}
