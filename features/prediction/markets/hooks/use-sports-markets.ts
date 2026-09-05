"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  fetchSportsEvent,
  fetchSportsEvents,
  fetchSportsFilters,
  type NormalSport,
  type SportsEvent,
  type SportsEventsParams,
} from "../api";
import {
  COMBO_EVENT_GC_TIME,
  COMBO_EVENT_STALE_TIME,
  COMBO_FILTER_GC_TIME,
  COMBO_FILTER_STALE_TIME,
} from "../cache-policy";
import { mergeComboEventPages } from "../merge-event-pages";
import { nextEventCursor } from "../pagination";

const EVENT_REFRESH_INTERVAL = 15 * 1000;
const EMPTY_EVENTS: SportsEvent[] = [];
const EMPTY_LEAGUES: Awaited<ReturnType<typeof fetchSportsFilters>>["leagues"] = [];

export function useSportsFilters(sport: NormalSport, league?: string, enabled = true) {
  const query = useQuery({
    queryKey: ["prediction-sports-filters", sport, league ?? null],
    queryFn: () => fetchSportsFilters(sport, league),
    enabled,
    staleTime: COMBO_FILTER_STALE_TIME,
    gcTime: COMBO_FILTER_GC_TIME,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    sports: query.data?.sports ?? [],
    selectedLeague: query.data?.selectedLeague ?? league ?? "",
    leagues: query.data?.leagues ?? EMPTY_LEAGUES,
    marketTypes: query.data?.marketTypes ?? [],
    loading: query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}

export function useSportsEvents(params: SportsEventsParams, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: [
      "prediction-sports-events",
      params.sport,
      params.league ?? null,
      params.search ?? null,
      params.cursor ?? null,
      params.limit ?? null,
    ],
    queryFn: ({ pageParam }) =>
      fetchSportsEvents({
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

export function useSportsEvent(eventId: string) {
  const query = useQuery({
    queryKey: ["prediction-sports-event", eventId],
    queryFn: () => fetchSportsEvent(eventId),
    enabled: /^\d+$/.test(eventId),
    staleTime: COMBO_EVENT_STALE_TIME,
    gcTime: COMBO_EVENT_GC_TIME,
    retry: false,
    refetchInterval: (current) =>
      current.state.status === "error" ? false : EVENT_REFRESH_INTERVAL,
  });

  return {
    event: query.data ?? null,
    loading: query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}
