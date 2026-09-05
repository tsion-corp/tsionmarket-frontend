"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchComboEvent, fetchComboEvents, fetchComboFilters } from "../api";
import type { ComboEvent, ComboEventsParams, ComboSport } from "../api";
import {
  COMBO_EVENT_GC_TIME,
  COMBO_EVENT_STALE_TIME,
  COMBO_FILTER_GC_TIME,
  COMBO_FILTER_STALE_TIME,
} from "../cache-policy";
import { mergeComboEventPages } from "../merge-event-pages";
import { nextEventCursor } from "../pagination";

const EVENT_REFRESH_INTERVAL = 15 * 1000;
const EMPTY_EVENTS: ComboEvent[] = [];
const EMPTY_LEAGUES: Awaited<ReturnType<typeof fetchComboFilters>>["leagues"] = [];

export function useComboFilters(sport: ComboSport, enabled = true) {
  const query = useQuery({
    queryKey: ["prediction-combo-filters", sport],
    queryFn: () => fetchComboFilters(sport),
    enabled,
    staleTime: COMBO_FILTER_STALE_TIME,
    gcTime: COMBO_FILTER_GC_TIME,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    leagues: query.data?.leagues ?? EMPTY_LEAGUES,
    marketTypes: query.data?.marketTypes ?? [],
    loading: query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}

export function useComboEvents(params: ComboEventsParams, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: [
      "prediction-combo-events",
      params.sport,
      params.league ?? null,
      params.search ?? null,
      params.cursor ?? null,
      params.limit ?? null,
    ],
    queryFn: ({ pageParam }) =>
      fetchComboEvents({
        ...params,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: params.cursor ?? null,
    getNextPageParam: (lastPage, _pages, _lastPageParam, pageParams) =>
      nextEventCursor(lastPage, pageParams),
    enabled,
    staleTime: COMBO_EVENT_STALE_TIME,
    gcTime: COMBO_EVENT_GC_TIME,
    retry: false,
  });

  const pages = query.data?.pages;
  const events = pages ? mergeComboEventPages(pages) : EMPTY_EVENTS;
  const lastPageEmpty = pages?.at(-1)?.events.length === 0;
  const shouldAdvanceEmptyPage =
    enabled &&
    lastPageEmpty &&
    query.hasNextPage &&
    !query.isFetchingNextPage &&
    !query.isFetchNextPageError;

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

export function useComboEvent(eventId: string) {
  const query = useQuery({
    queryKey: ["prediction-combo-event", eventId],
    queryFn: () => fetchComboEvent(eventId),
    enabled: /^\d+$/.test(eventId),
    staleTime: COMBO_EVENT_STALE_TIME,
    gcTime: COMBO_EVENT_GC_TIME,
    retry: false,
    refetchInterval: (query) => (query.state.status === "error" ? false : EVENT_REFRESH_INTERVAL),
  });

  return {
    event: query.data ?? null,
    loading: query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}
