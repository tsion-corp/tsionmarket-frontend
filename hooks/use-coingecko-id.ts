"use client";

import { useQuery } from "@tanstack/react-query";

// Resolves a token's CoinGecko coin id from its contract address (via
// /api/token-chart-id), so a spot market outside the top-coins feed can still be
// charted. The result is effectively permanent, so it never refetches; a miss
// resolves to null and the caller shows its own fallback.
export function useCoingeckoId(platform: string | null, address: string | null) {
  const { data, isPending } = useQuery<{ id: string | null }>({
    queryKey: ["coingecko-id", platform, address],
    enabled: Boolean(platform && address),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const params = new URLSearchParams({ platform: platform!, address: address! });
      const res = await fetch(`/api/token-chart-id?${params.toString()}`);
      if (!res.ok) return { id: null };
      return res.json();
    },
  });

  return {
    id: data?.id ?? null,
    loading: Boolean(platform && address) && isPending,
  };
}
