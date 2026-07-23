"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchYieldHistory, type YieldHistoryPoint } from "@/lib/rwa-api";

const FIVE_MINUTES = 5 * 60 * 1000;

// Yield and TVL history for one asset, used by the detail sheet chart. Disabled
// until an id is passed so the sheet only fetches when it opens on an asset.
export function useRwaYieldHistory(id: string | null, limit = 90) {
  const { data, isPending, isError } = useQuery<YieldHistoryPoint[]>({
    queryKey: ["rwa-yield-history", id, limit],
    enabled: Boolean(id),
    queryFn: () => fetchYieldHistory(id!, limit),
    staleTime: FIVE_MINUTES,
  });

  return { points: data ?? [], loading: Boolean(id) && isPending, error: isError };
}
