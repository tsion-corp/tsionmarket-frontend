"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  fetchDiscoverHouses,
  fetchLiveStreams,
  fetchScheduledStreams,
  fetchSquareMe,
  fetchSquareTopics,
  fetchSuggestedProfiles,
  searchSquare,
} from "@/lib/api/market-square";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";

/**
 * The reads behind the Square page, one per section of the Square's Home.
 *
 * Five reads on first visit, each kept for a minute and none on an interval:
 * the page is opened to look, not left open to watch, and the feed's own hook
 * already follows the same rule. All of them are off while the square is
 * hidden, which is also when the page renders nothing, so a hidden square
 * costs no request.
 */
const HOME_STALE_MS = 60_000;

/** How many of each the page shows. Home's rails hold about this many. */
const ROOMS_LIMIT = 8;
const PEOPLE_LIMIT = 24;
const HOUSES_LIMIT = 8;

export const SQUARE_HOME_KEYS = {
  rooms: (status: "live" | "scheduled") => ["market-square", "rooms", status] as const,
  people: ["market-square", "people"] as const,
  houses: ["market-square", "houses"] as const,
  // Shared with the dashboard's section and the compose sheet, so the
  // reader's identity and the topic vocabulary are fetched once for all.
  me: ["market-square", "me"] as const,
  topics: ["market-square", "topics"] as const,
};

/**
 * The Square's topic vocabulary, to label the chips on a room card. The key
 * stands in for a label while this is on its way, so a room never waits on
 * it. The vocabulary changes about as often as a deploy does.
 */
export function useSquareTopics() {
  return useQuery({
    queryKey: SQUARE_HOME_KEYS.topics,
    queryFn: fetchSquareTopics,
    enabled: !MARKET_SQUARE_HIDDEN,
    staleTime: 30 * 60_000,
  });
}

const enabled = !MARKET_SQUARE_HIDDEN;

/** The rooms live now, or the rooms that have not opened yet. */
export function useSquareRooms(status: "live" | "scheduled") {
  return useQuery({
    queryKey: SQUARE_HOME_KEYS.rooms(status),
    queryFn: () =>
      status === "live" ? fetchLiveStreams(ROOMS_LIMIT) : fetchScheduledStreams(ROOMS_LIMIT),
    enabled,
    staleTime: HOME_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

/** People to meet, busiest first, the way Home's deck orders them. */
export function useSquarePeople() {
  return useQuery({
    queryKey: SQUARE_HOME_KEYS.people,
    queryFn: () => fetchSuggestedProfiles(PEOPLE_LIMIT),
    enabled,
    staleTime: HOME_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

/** The house directory, busiest first. */
export function useSquareHouses() {
  return useQuery({
    queryKey: SQUARE_HOME_KEYS.houses,
    queryFn: () => fetchDiscoverHouses(HOUSES_LIMIT),
    enabled,
    staleTime: HOME_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

/**
 * The reader's own square identity, to keep them out of "Make some friends"
 * and off their own follow buttons. A failure costs nothing but those two
 * courtesies, so it is not retried.
 */
export function useSquareMe() {
  return useQuery({
    queryKey: SQUARE_HOME_KEYS.me,
    queryFn: fetchSquareMe,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Home's search, answered in place: everything the Square finds for the
 * words typed, paged on the service's cursor. Nothing is asked while the
 * field is empty, and a query is kept half a minute so retyping it is free.
 */
export function useSquareSearch(query: string) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: ["market-square", "search", trimmed] as const,
    queryFn: ({ pageParam }) => searchSquare(trimmed, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !MARKET_SQUARE_HIDDEN && trimmed.length > 0,
    staleTime: 30_000,
  });
}
