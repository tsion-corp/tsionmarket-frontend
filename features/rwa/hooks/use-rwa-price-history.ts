"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { AreaPoint } from "@/hooks/use-chart";

const FIVE_MINUTES = 5 * 60 * 1000;

const EMPTY_POINTS: AreaPoint[] = [];

// A week of hourly closes for one RWA. Disabled until an asset is passed, so
// the sheet only fetches when it opens.
export function useRwaPriceHistory(chain: string | null, address: string | null) {
  const enabled = Boolean(chain && address);
  const { data, isPending, isError } = useQuery<{ points: AreaPoint[] }>({
    queryKey: ["rwa-price-history", chain, address],
    enabled,
    staleTime: FIVE_MINUTES,
    queryFn: async () => {
      const params = new URLSearchParams({ chain: chain!, address: address! });
      const res = await apiFetch(`/api/rwa-chart?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) throw new Error("Price history request failed");
      return res.json();
    },
  });

  return { points: data?.points ?? EMPTY_POINTS, loading: enabled && isPending, error: isError };
}
