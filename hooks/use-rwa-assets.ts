"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRwaAssets, fetchRwaCategories } from "@/lib/rwa-api";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";

const SIXTY_SECONDS = 60 * 1000;

// Stable identities for the loading/empty state so the RWA table's `data` and
// any dependent memos don't churn every render. Element types are derived from
// the fetchers so they always match the query's data shape.
const EMPTY_ASSETS: Awaited<ReturnType<typeof fetchRwaAssets>> = [];
const EMPTY_CATEGORIES: Awaited<ReturnType<typeof fetchRwaCategories>> = [];

export function useRwaAssets(filters: Record<string, string> = {}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["rwa-assets", filters],
    queryFn: () => fetchRwaAssets(filters),
    staleTime: SIXTY_SECONDS,
    gcTime: PERSISTED_GC_TIME,
    refetchInterval: SIXTY_SECONDS,
  });
  const assets = data ?? EMPTY_ASSETS;
  return {
    assets,
    loading: isPending,
    // Only surface the error when there is nothing to show. A transient refetch
    // failure keeps the last-good (or persisted) registry on screen instead of
    // blanking a table that was working.
    error: isError && assets.length === 0,
    refetch,
  };
}

export function useRwaCategories() {
  const { data } = useQuery({
    queryKey: ["rwa-categories"],
    queryFn: fetchRwaCategories,
    staleTime: 5 * SIXTY_SECONDS,
    gcTime: PERSISTED_GC_TIME,
  });
  return data ?? EMPTY_CATEGORIES;
}
