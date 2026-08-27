"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchSquareFeed, type SquareLane } from "@/lib/api/market-square";
import { MARKET_SQUARE_URL } from "@/lib/market-square";

export const SQUARE_KEYS = {
  // Topics are part of the key: a filtered lane is a different list, and
  // sharing a cache entry with the unfiltered one would show the wrong posts
  // for a frame every time the tab changes.
  feed: (lane: SquareLane, topics?: string[]) =>
    ["market-square", "feed", lane, (topics ?? []).join(",")] as const,
};

/**
 * The square's feed, paged.
 *
 * Disabled entirely when the square's URL is unset. Without it the proxy has
 * no upstream, so every request would fail — and a dashboard section that only
 * ever renders an error is worse than one that is not there. The section
 * checks the same condition and does not mount.
 */
export function useSquareFeed(lane: SquareLane, topics?: string[]) {
  return useInfiniteQuery({
    queryKey: SQUARE_KEYS.feed(lane, topics),
    queryFn: ({ pageParam }) => fetchSquareFeed(lane, pageParam, 10, topics),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: MARKET_SQUARE_URL !== "",
    // The square is a side surface here, not the reason anyone opened Ark.
    // A minute-old post is fine; refetching on every tab focus would spend the
    // player's data to reorder something they are scrolling past.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
