"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  TradeApiError,
  fetchToken,
  fetchTokenCatalog,
  fetchTokenCatalogPage,
  fetchTrendingTokens,
  searchTokens,
  type MemeToken,
} from "@/lib/meme/api";
import {
  DEFAULT_DISCOVERY_VIEW,
  isMemecoinHere,
  mergeCatalogPages,
  nextCatalogPage,
  tradableHere,
  type DiscoveryView,
} from "@/lib/meme/catalog";
import type { MemeChainSlug } from "@/lib/meme/chain";
import { useSectionActive } from "@/components/ui/section-visibility";
import { pollUnlessFailing } from "@/lib/query-poll";

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
    refetchInterval: pollUnlessFailing(TRENDING_POLL_MS),
    staleTime: 15_000,
  });
  return {
    tokens: query.data?.items ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

// The catalogue as the contract says to read it: a page of 500 at a time,
// "until page * limit >= total", and never an unbounded read. Page 1 loads on
// mount; each further page only when `loadMore` is called, and `hasMore` goes
// false once the pages cover the server's total.
//
// The pages are merged (a row repeated across pages appears once, by
// chainId:address) and the discovery view is applied over the merge, so
// switching between Curated and All re-filters what is already held and asks
// the service for nothing. `total` is the server's catalogue size, `loaded`
// how many of those rows are in hand, `shownCount` how many the view kept.
export function useMemeCatalog({
  view = DEFAULT_DISCOVERY_VIEW,
  chain,
}: { view?: DiscoveryView; chain?: MemeChainSlug } = {}) {
  const query = useInfiniteQuery({
    queryKey: ["meme", "catalog", "pages", chain ?? "all"],
    queryFn: ({ pageParam }) => fetchTokenCatalogPage(pageParam, chain),
    initialPageParam: 1,
    getNextPageParam: (last) => nextCatalogPage(last.meta),
    staleTime: 15_000,
  });
  const pages = query.data?.pages;
  const merged = useMemo(() => (pages ? mergeCatalogPages(pages) : null), [pages]);
  const shown = useMemo(() => (merged ? tradableHere(merged, view) : null), [merged, view]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return {
    tokens: shown?.items ?? [],
    /** The server's catalogue size; null until the first page lands. */
    total: merged ? merged.meta.total : null,
    loaded: merged?.items.length ?? 0,
    shownCount: shown?.shownCount ?? 0,
    hasMore: hasNextPage,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    // A failed "Load more" keeps the pages already held; the error is still
    // reported so the surface can say so.
    error: query.error,
    refetch: query.refetch,
  };
}

// One server page of the catalogue at a small size, for the pro view's coin
// picker, which pages on the server. The previous page stays on screen while
// the next loads, so paging never blanks the list.
export function useMemeCatalogPage(page: number, limit = 10, chain?: MemeChainSlug) {
  const query = useQuery({
    queryKey: ["meme", "catalog", page, limit, chain ?? "all"],
    queryFn: () => fetchTokenCatalog(page, limit, chain),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const total = query.data?.meta.total ?? 0;
  return {
    tokens: query.data?.items ?? [],
    pageCount: Math.max(1, Math.ceil(total / limit)),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// Debounced provider-backed search (rate limited upstream at 30/min). Queries
// under two characters never leave the client. The service's results are
// fetched once and judged by the view here, so switching views does not spend
// another search.
export function useMemeSearch(raw: string, view: DiscoveryView = DEFAULT_DISCOVERY_VIEW) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const q = raw.trim();
    const id = setTimeout(() => setDebounced(q.length >= 2 ? q : ""), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  const query = useQuery({
    queryKey: ["meme", "search", debounced],
    queryFn: () => searchTokens(debounced, "all"),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const data = query.data;
  const results = useMemo(
    () => (data ?? []).filter((token) => isMemecoinHere(token, view)),
    [data, view]
  );
  return {
    results,
    searching: debounced.length >= 2 && query.isPending,
    active: debounced.length >= 2,
    // A failed search is not "nothing matched"; the list says so instead.
    error: query.error,
  };
}

// The contract's detail-route semantics. HTTP 502 PROVIDER_ERROR means every
// Solana RPC provider was unavailable or rate-limited: temporary, so retry with
// exponential backoff. HTTP 404 TOKEN_NOT_FOUND is a lookup that succeeded and
// found nothing: never retried. A failure that never reached the service (no
// TradeApiError) is treated as temporary too. Neither is cached as a missing
// token: a failed query stores no data, and the relay caches only successes.
const TOKEN_RETRIES = 4;
const TOKEN_RETRY_BASE_MS = 1_000;

export type MemeTokenUnavailable = "temporary" | "not-found";

function isTemporary(error: unknown): boolean {
  return !(error instanceof TradeApiError) || error.status === 502;
}

function unavailableReason(error: unknown): MemeTokenUnavailable | null {
  if (!error) return null;
  return error instanceof TradeApiError && error.status === 404 ? "not-found" : "temporary";
}

// Fresh risk-assessed details for the selected token; search rows don't carry
// current risk/tradability, so the trade surface always re-reads this.
// Identity is chainId + address, per the service contract: the detail route
// needs the chain by name, and two chains can carry the same symbol.
export function useMemeToken(identity: Pick<MemeToken, "address" | "chainId"> | null) {
  const active = useSectionActive();
  const address = identity?.address ?? null;
  const chainId = identity?.chainId ?? null;
  const query = useQuery({
    queryKey: ["meme", "token", chainId, address],
    queryFn: () => fetchToken(address as string, chainId as number),
    subscribed: active,
    enabled: !!address && chainId !== null,
    staleTime: 20_000,
    refetchInterval: pollUnlessFailing(30_000),
    retry: (failureCount, error) => isTemporary(error) && failureCount < TOKEN_RETRIES,
    // 1 s, 2 s, 4 s, 8 s.
    retryDelay: (failureCount) => TOKEN_RETRY_BASE_MS * 2 ** failureCount,
  });
  return {
    // The last good read stays on screen through a later failure.
    token: query.data ?? null,
    isLoading: query.isPending && !!address,
    unavailable: unavailableReason(query.error),
  };
}
