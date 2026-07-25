"use client";

import { useQuery } from "@tanstack/react-query";

// Matches usePortfolio's poll interval — same backend, same reasoning.
const POLL_MS = 60 * 1000;

// Stable identity for the loading/empty state so consumers keying memos or
// effects on the prices map don't churn every render.
const EMPTY_PRICES: Record<string, number> = {};

export function usePrices(symbols: string[]) {
  const key = [...symbols].sort();
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["prices", key],
    enabled: symbols.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const s of symbols) params.append("symbols", s);
      const res = await fetch(`/api/prices?${params.toString()}`);
      if (!res.ok) {
        throw new Error(res.status === 429 ? "Too many requests" : "Prices request failed");
      }
      const body = await res.json();
      const map: Record<string, number> = {};
      for (const p of body.prices ?? []) map[p.symbol] = p.priceUsd;
      return map;
    },
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  return data ?? EMPTY_PRICES;
}
