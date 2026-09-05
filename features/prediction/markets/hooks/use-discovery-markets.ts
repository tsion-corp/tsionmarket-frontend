"use client";

import { useEffect } from "react";
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
}

export function useDiscoveryEvents(
  category: DiscoveryCategory,
  sort: DiscoveryMarketSort,
  options: DiscoveryEventsOptions = {}
) {
  const params: DiscoveryEventsParams = { category, sort, limit: options.limit ?? 12 };
  const query = useInfiniteQuery({
    queryKey: ["prediction-discovery-events", params.category, sort, params.limit],
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
  const lastPageEmpty = pages?.at(-1)?.events.length === 0;
  const shouldAdvanceEmptyPage =
    lastPageEmpty && query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;

  useEffect(() => {
    if (shouldAdvanceEmptyPage) void query.fetchNextPage();
  }, [query, shouldAdvanceEmptyPage]);

  return {
    events,
    loading: query.isPending || (events.length === 0 && query.isFetchingNextPage),
    error: query.isError && events.length === 0,
    loadMoreError: query.isFetchNextPageError,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage && !lastPageEmpty,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
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
