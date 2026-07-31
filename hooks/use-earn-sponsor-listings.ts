"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchIsCreateAllowed,
  fetchSponsorListing,
  fetchSponsorSubmissions,
  publishListing,
  rejectSubmissions,
  saveListingDraft,
  toggleWinners,
  updateListing,
} from "@/lib/earn/api/sponsor-dashboard";
import { LISTING_KEYS } from "@/hooks/use-earn-listings";
import type { ListingType, WinnerSelection } from "@/lib/earn/api/types";
import type { ListingPayload } from "@/lib/earn/listing-form";

export const SPONSOR_LISTING_KEYS = {
  createAllowed: ["earn", "sponsor-dashboard", "create-allowed"] as const,
  listing: (slug: string, type: ListingType) =>
    ["earn", "sponsor-dashboard", "listing", slug, type] as const,
  submissions: (slug: string) => ["earn", "sponsor-dashboard", "submissions", slug] as const,
};

// Whether this sponsor may open another listing. The service decides, based on
// how many they already have running.
export function useIsCreateAllowed() {
  const query = useQuery({
    queryKey: SPONSOR_LISTING_KEYS.createAllowed,
    queryFn: fetchIsCreateAllowed,
  });

  return {
    // Assume not allowed until the service says otherwise, so the create
    // button never invites a sponsor into a flow that will be refused.
    allowed: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useSponsorListing(slug: string | null, type: ListingType) {
  const query = useQuery({
    queryKey: SPONSOR_LISTING_KEYS.listing(slug ?? "none", type),
    queryFn: () => fetchSponsorListing(slug as string, type),
    enabled: !!slug,
  });

  return {
    listing: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useSponsorSubmissions(slug: string | null) {
  const query = useQuery({
    queryKey: SPONSOR_LISTING_KEYS.submissions(slug ?? "none"),
    queryFn: () => fetchSponsorSubmissions(slug as string),
    enabled: !!slug,
  });

  return {
    submissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useSaveListingDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ListingPayload) => saveListingDraft(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPONSOR_LISTING_KEYS.createAllowed });
    },
  });
}

// Publishing puts the listing in the public feed, so both the sponsor's view
// and the browse feed are stale afterwards.
export function usePublishListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishListing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["earn", "listings"] });
      void queryClient.invalidateQueries({ queryKey: ["earn", "sponsor-dashboard"] });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ListingPayload }) =>
      updateListing(id, payload),
    onSuccess: (listing) => {
      void queryClient.invalidateQueries({ queryKey: ["earn", "sponsor-dashboard"] });
      if (listing) {
        void queryClient.invalidateQueries({ queryKey: LISTING_KEYS.detail(listing.slug) });
      }
    },
  });
}

// Both review actions take the listing slug so the feed they changed can be
// refetched. The service's response carries no listing, so the caller names it.
export function useRejectSubmissions(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => rejectSubmissions(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPONSOR_LISTING_KEYS.submissions(slug) });
    },
  });
}

export function useToggleWinners(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selections: WinnerSelection[]) => toggleWinners(selections),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPONSOR_LISTING_KEYS.submissions(slug) });
    },
  });
}
