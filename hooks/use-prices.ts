"use client";

import { useQuery } from "@tanstack/react-query";

const THIRTY_SECONDS = 30 * 1000;

export function usePrices(symbols: string[]) {
  const key = [...symbols].sort();
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["prices", key],
    enabled: symbols.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const s of symbols) params.append("symbols", s);
      const res = await fetch(`/api/prices?${params.toString()}`);
      if (!res.ok) throw new Error("Prices request failed");
      const body = await res.json();
      const map: Record<string, number> = {};
      for (const p of body.prices ?? []) map[p.symbol] = p.priceUsd;
      return map;
    },
    staleTime: THIRTY_SECONDS,
    refetchInterval: THIRTY_SECONDS,
  });
  return data ?? {};
}
