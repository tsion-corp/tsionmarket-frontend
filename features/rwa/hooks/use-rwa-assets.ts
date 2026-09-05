"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRwaAssets, fetchRwaCategories } from "@/features/rwa/lib/api";
import type { RwaApiAsset } from "@/features/rwa/lib/api";
import { isListedAsset } from "@/features/rwa/lib/presenter";
import { PERSISTED_GC_TIME } from "@/lib/query-persist";
import { useSectionActive } from "@/components/ui/section-visibility";

const SIXTY_SECONDS = 60 * 1000;

// Stable identities for the loading/empty state so the RWA table's `data` and
// any dependent memos don't churn every render. Element types are derived from
// the fetchers so they always match the query's data shape.
const EMPTY_ASSETS: Awaited<ReturnType<typeof fetchRwaAssets>> = [];
const EMPTY_CATEGORIES: Awaited<ReturnType<typeof fetchRwaCategories>> = [];

export function useRwaAssets(filters: Record<string, string> = {}) {
  const active = useSectionActive();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["rwa-assets", filters],
    queryFn: () => fetchRwaAssets(filters),
    staleTime: SIXTY_SECONDS,
    gcTime: PERSISTED_GC_TIME,
    // `subscribed`, not `enabled`. Both stop the timer, but `enabled: false`
    // also parks the query in `pending` with its data unavailable and
    // `refetch()` refused, so scrolling back showed a skeleton. `subscribed`
    // only detaches the observer: the last data stays on screen, `refetch()`
    // still works, and the query drops out of the window-focus herd too.
    subscribed: active,
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
  // No interval and a five minute staleTime, so there is no poll to pause.
  const { data } = useQuery({
    queryKey: ["rwa-categories"],
    queryFn: fetchRwaCategories,
    staleTime: 5 * SIXTY_SECONDS,
    gcTime: PERSISTED_GC_TIME,
  });
  return data ?? EMPTY_CATEGORIES;
}

/**
 * The assets the table may offer: the same registry request, narrowed to what
 * a user can actually buy.
 *
 * Applied here rather than in a component so every screen that lists assets
 * gets the same answer and none of them can widen it by accident. It shares
 * `useRwaAssets`'s query key, so this is a filter over one fetch, not a second.
 *
 * Selling is deliberately not routed through this: someone holding an asset on
 * a chain we no longer list still has to be able to sell it, and that path
 * resolves against the full registry.
 */
export function useListedRwaAssets() {
  const active = useSectionActive();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["rwa-assets", {}],
    queryFn: () => fetchRwaAssets({}),
    staleTime: SIXTY_SECONDS,
    gcTime: PERSISTED_GC_TIME,
    enabled: active,
    refetchInterval: SIXTY_SECONDS,
    select: (all: RwaApiAsset[]) => all.filter(isListedAsset),
  });
  const assets = data ?? EMPTY_ASSETS;
  return { assets, loading: isPending, error: isError && assets.length === 0, refetch };
}
