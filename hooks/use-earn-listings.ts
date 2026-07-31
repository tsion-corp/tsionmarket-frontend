"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchListingCount, fetchListingDetail, fetchListings } from "@/lib/earn/api/listings";
import type { BrowseQuery } from "@/lib/earn/api/types";

export const LISTING_KEYS = {
  feed: (query: BrowseQuery) => ["earn", "listings", query] as const,
  count: (query: BrowseQuery) => ["earn", "listings", "count", query] as const,
  detail: (slug: string) => ["earn", "listings", "detail", slug] as const,
};

// The browse feed. Public, so it renders for a signed-out visitor looking at
// what is on offer before they decide to sign in.
export function useListingFeed(query: BrowseQuery) {
  const listings = useQuery({
    queryKey: LISTING_KEYS.feed(query),
    queryFn: () => fetchListings(query),
  });

  // The count is what the service says the filter matches, which can differ
  // from the page we were handed. It is shown as a heading figure, so a
  // failure here must not take the feed down with it.
  const count = useQuery({
    queryKey: LISTING_KEYS.count(query),
    queryFn: () => fetchListingCount(query),
  });

  return {
    listings: listings.data ?? [],
    count: count.data ?? null,
    isLoading: listings.isLoading,
    error: listings.error,
  };
}

export function useListingDetail(slug: string | null) {
  const query = useQuery({
    queryKey: LISTING_KEYS.detail(slug ?? "none"),
    queryFn: () => fetchListingDetail(slug as string),
    enabled: !!slug,
  });

  return {
    listing: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
