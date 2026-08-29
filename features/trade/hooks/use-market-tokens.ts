"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MarketToken } from "@/lib/market-catalog";
import { apiFetch } from "@/lib/api";

const TWO_MINUTES = 2 * 60 * 1000;

export function useMarketTokens(filter: string) {
  return useQuery<MarketToken[]>({
    queryKey: ["market-tokens", filter],
    staleTime: TWO_MINUTES,
    gcTime: TWO_MINUTES,
    // Keep the previous chain's rows visible while the next chain loads, so a
    // slow/rate-limited fetch never blanks the table.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiFetch(`/api/market-tokens?filter=${encodeURIComponent(filter)}`);
      if (!res.ok) throw new Error("Could not load markets");
      const data = await res.json();
      return (data.tokens ?? []) as MarketToken[];
    },
  });
}
