"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchToken,
  fetchTokenCatalog,
  fetchTrendingTokens,
  searchTokens,
  type MemeToken,
} from "@/lib/meme/api";
import { useSectionActive } from "@/components/ui/section-visibility";

const TRENDING_POLL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 350;

export function useTrendingMemes() {
  const active = useSectionActive();
  const query = useQuery({
    queryKey: ["meme", "trending"],
    queryFn: fetchTrendingTokens,
    // `subscribed`, not `enabled`. Both stop the timer, but `enabled: false`
    // also parks the query in `pending` with its data unavailable and
    // `refetch()` refused, so scrolling back showed a skeleton. `subscribed`
    // only detaches the observer: the last data stays on screen, `refetch()`
    // still works, and the query drops out of the window-focus herd too.
    subscribed: active,
    refetchInterval: TRENDING_POLL_MS,
    staleTime: 15_000,
  });
  return {
    tokens: query.data?.items ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

// The pro table's server-paginated catalog. The previous page stays on screen
// while the next loads, so paging never blanks the table.
export function useMemeCatalog(page: number, limit = 10) {
  const query = useQuery({
    queryKey: ["meme", "catalog", page, limit],
    queryFn: () => fetchTokenCatalog(page, limit),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const total = query.data?.meta.total ?? 0;
  return {
    tokens: query.data?.items ?? [],
    pageCount: Math.max(1, Math.ceil(total / limit)),
    isLoading: query.isPending,
    isFetching: query.isFetching,
  };
}

// Debounced provider-backed search (rate limited upstream at 30/min). Queries
// under two characters never leave the client.
export function useMemeSearch(raw: string) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const q = raw.trim();
    const id = setTimeout(() => setDebounced(q.length >= 2 ? q : ""), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  const query = useQuery({
    queryKey: ["meme", "search", debounced],
    queryFn: () => searchTokens(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  return {
    results: query.data ?? [],
    searching: debounced.length >= 2 && query.isPending,
    active: debounced.length >= 2,
  };
}

// Fresh risk-assessed details for the selected token; search rows don't carry
// current risk/tradability, so the trade surface always re-reads this.
export function useMemeToken(address: string | null) {
  const active = useSectionActive();
  const query = useQuery({
    queryKey: ["meme", "token", address],
    queryFn: () => fetchToken(address as string),
    subscribed: active,
    enabled: !!address,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  return {
    token: (query.data ?? null) as MemeToken | null,
    isLoading: query.isPending && !!address,
  };
}
