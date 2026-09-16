"use client";

import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQuery, type QueryKey } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSectionActive } from "@/components/ui/section-visibility";
import { nextCatalogPage, type Paged } from "@/lib/meme/catalog";
import {
  PORTFOLIO_PAGE_LIMIT,
  fetchActivity,
  fetchPortfolio,
  fetchPortfolioSummary,
  fetchPosition,
  memePortfolioKeys,
  type ActivityFilters,
  type PortfolioChain,
  type PortfolioPosition,
  type TradeActivity,
} from "@/lib/meme/portfolio";

// The trade service's portfolio on the portfolio screen.
//
// Each query refreshes every minute, and only while the portfolio section is
// on screen (useSectionActive): `subscribed`, not `enabled`, so scrolling away
// keeps the last figures and scrolling back resumes without a skeleton. A swap
// reaching CONFIRMED invalidates all of them at once from the trade hook,
// through the key prefix in lib/meme/portfolio, so neither feature imports
// the other. Nothing is asked before the user is signed in: every route needs
// the bearer.

export const MEME_PORTFOLIO_POLL_MS = 60_000;
const STALE_MS = 30_000;

function useSignedIn(): boolean {
  const { ready, authenticated } = usePrivy();
  return ready && authenticated;
}

export function useMemePortfolioSummary() {
  const active = useSectionActive();
  const signedIn = useSignedIn();
  const query = useQuery({
    queryKey: memePortfolioKeys.summary(),
    queryFn: fetchPortfolioSummary,
    enabled: signedIn,
    subscribed: active,
    refetchInterval: MEME_PORTFOLIO_POLL_MS,
    staleTime: STALE_MS,
  });
  return {
    summary: query.data ?? null,
    isLoading: signedIn && query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface PagedList<T> {
  items: T[];
  /** The server's total, once a page has arrived. */
  total: number | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  /** Set when the failure was a "Load more", so the rows already shown stay. */
  loadMoreFailed: boolean;
  refetch: () => unknown;
}

// A server-paged list at the contract's 50 a page: page 1 on mount, each
// further page only on `loadMore`, none once page * limit covers the total.
// A row repeated across pages (the poll re-reads them while the ledger moves)
// is shown once.
function usePagedList<T>(
  queryKey: QueryKey,
  fetchPage: (page: number) => Promise<Paged<T>>,
  keyOf: (row: T) => string
): PagedList<T> {
  const active = useSectionActive();
  const signedIn = useSignedIn();
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => nextCatalogPage(last.meta),
    enabled: signedIn,
    subscribed: active,
    refetchInterval: MEME_PORTFOLIO_POLL_MS,
    staleTime: STALE_MS,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const rows: T[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const row of page.items) {
        const key = keyOf(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }
    return rows;
  }, [query.data, keyOf]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    // A failed page lands on the query's error state, which the list shows
    // beside the rows it already has; fetchNextPage does not reject.
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    items,
    total: query.data?.pages.at(-1)?.meta.total ?? null,
    hasMore: Boolean(hasNextPage),
    loadMore,
    isLoading: signedIn && query.isPending,
    isLoadingMore: isFetchingNextPage,
    error: query.error,
    loadMoreFailed: query.isFetchNextPageError,
    refetch: query.refetch,
  };
}

// A position is chainId + address; an EVM address compares without case, a
// Solana mint exactly as written.
function positionKey(position: PortfolioPosition): string {
  const address = position.chain === "solana" ? position.address : position.address.toLowerCase();
  return `${position.chainId}:${address}`;
}

const activityKey = (row: TradeActivity) => row.id;

/** Positions, open and closed, on every chain or on `chain` alone. */
export function useMemePortfolio(chain?: PortfolioChain): PagedList<PortfolioPosition> {
  const fetchPage = useCallback(
    (page: number) => fetchPortfolio(page, PORTFOLIO_PAGE_LIMIT, chain),
    [chain]
  );
  return usePagedList(memePortfolioKeys.positions(chain), fetchPage, positionKey);
}

/** The user-facing feed of every swap, in any state. */
export function useMemeActivity(filters: ActivityFilters = {}): PagedList<TradeActivity> {
  const { chain, side, status } = filters;
  const fetchPage = useCallback(
    (page: number) =>
      fetchActivity({
        page,
        limit: PORTFOLIO_PAGE_LIMIT,
        ...(chain ? { chain } : {}),
        ...(side ? { side } : {}),
        ...(status ? { status } : {}),
      }),
    [chain, side, status]
  );
  return usePagedList(memePortfolioKeys.activity({ chain, side, status }), fetchPage, activityKey);
}

/** One position and its confirmed trades, once one is chosen. */
export function useMemePosition(chain: PortfolioChain | null, address: string | null) {
  const active = useSectionActive();
  const signedIn = useSignedIn();
  const query = useQuery({
    queryKey: memePortfolioKeys.position(chain ?? "base", address ?? ""),
    queryFn: () => {
      if (chain === null || address === null) throw new Error("No position chosen.");
      return fetchPosition(chain, address);
    },
    enabled: signedIn && chain !== null && address !== null,
    subscribed: active,
    refetchInterval: MEME_PORTFOLIO_POLL_MS,
    staleTime: STALE_MS,
  });
  return {
    position: query.data ?? null,
    isLoading: signedIn && address !== null && query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
