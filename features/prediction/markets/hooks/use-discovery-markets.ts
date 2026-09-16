"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchDiscoveryEvent, fetchDiscoveryEvents } from "../api";
import type {
  DiscoveryCategory,
  DiscoveryEventsParams,
  DiscoveryMarketEvent,
  DiscoveryMarketSort,
} from "../api";
import { COMBO_EVENT_GC_TIME, COMBO_EVENT_STALE_TIME } from "../cache-policy";
import { mergeDiscoveryEventPages } from "../merge-discovery-pages";
import { nextEventCursor } from "../pagination";

const EMPTY_EVENTS: DiscoveryMarketEvent[] = [];

interface DiscoveryEventsOptions {
  enabled?: boolean;
  limit?: number;
  marketLimit?: number;
}

export function useDiscoveryEvents(
  category: DiscoveryCategory,
  sort: DiscoveryMarketSort,
  options: DiscoveryEventsOptions = {}
) {
  const params: DiscoveryEventsParams = {
    category,
    sort,
    limit: options.limit ?? 12,
    marketLimit: options.marketLimit,
  };
  const query = useInfiniteQuery({
    queryKey: [
      "prediction-discovery-events",
      params.category,
      sort,
      params.limit,
      params.marketLimit,
    ],
    queryFn: ({ pageParam }) => fetchDiscoveryEvents({ ...params, cursor: pageParam ?? undefined }),
    enabled: options.enabled ?? true,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _pages, _lastPageParam, pageParams) =>
      nextEventCursor(lastPage, pageParams),
    staleTime: COMBO_EVENT_STALE_TIME,
    gcTime: COMBO_EVENT_GC_TIME,
    retry: false,
  });

  const pages = query.data?.pages;
  const events = pages ? mergeDiscoveryEventPages(pages) : EMPTY_EVENTS;
  const fetchNextPage = query.fetchNextPage;
  const refetch = query.refetch;
  const lastPage = pages?.at(-1);
  const unavailable = lastPage?.unavailable === true;
  const retryAfterMs = lastPage?.retryAfterMs ?? 5_000;
  const recoveryAttempts = useRef(0);
  const lastPageEmpty = pages?.at(-1)?.events.length === 0;
  const shouldAdvanceEmptyPage =
    lastPageEmpty && query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;

  useEffect(() => {
    if (shouldAdvanceEmptyPage) void fetchNextPage();
  }, [fetchNextPage, shouldAdvanceEmptyPage]);

  useEffect(() => {
    recoveryAttempts.current = 0;
  }, [category, sort]);

  useEffect(() => {
    if (!unavailable) {
      recoveryAttempts.current = 0;
      return;
    }
    if (recoveryAttempts.current >= 2) return;

    const timer = window.setTimeout(() => {
      recoveryAttempts.current += 1;
      void refetch();
    }, retryAfterMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query.dataUpdatedAt, refetch, retryAfterMs, unavailable]);

  return {
    events,
    loading: query.isPending || (events.length === 0 && query.isFetchingNextPage),
    unavailable,
    error: query.isError && events.length === 0,
    loadMoreError: query.isFetchNextPageError,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage && !lastPageEmpty,
    loadMore: fetchNextPage,
    refetch,
  };
}

export function useDiscoveryEvent(eventId: string) {
  const query = useQuery({
    queryKey: ["prediction-discovery-event", eventId],
    queryFn: () => fetchDiscoveryEvent(eventId),
    enabled: /^\d+$/.test(eventId),
    staleTime: COMBO_EVENT_STALE_TIME,
    gcTime: COMBO_EVENT_GC_TIME,
    retry: false,
  });

  return {
    event: query.data ?? null,
    loading: query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}
