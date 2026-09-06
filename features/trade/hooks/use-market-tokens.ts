"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MarketToken } from "@/lib/market-catalog";
import { apiFetch } from "@/lib/api";

const TWO_MINUTES = 2 * 60 * 1000;

export function useMarketTokens(filter: string, enabled = true) {
  return useQuery<MarketToken[]>({
    queryKey: ["market-tokens", filter],
    enabled,
    staleTime: TWO_MINUTES,
    gcTime: TWO_MINUTES,
    // Keep the previous chain's rows visible while the next chain loads, so a
    // slow/rate-limited fetch never blanks the table.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Anonymous on purpose. This response is identical for every caller,
      // and a request carrying an Authorization header can never be stored by
      // a shared cache, so sending credentials here would make the route's
      // s-maxage inert.
      const res = await apiFetch(
        `/api/market-tokens?filter=${encodeURIComponent(filter)}`,
        {},
        { anonymous: true }
      );
      if (!res.ok) throw new Error("Could not load markets");
      const data = await res.json();
      return (data.tokens ?? []) as MarketToken[];
    },
  });
}
