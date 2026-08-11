"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  announceWinners,
  fetchIsCreateAllowed,
  fetchEscrowStatus,
  fundListing,
  releaseEscrow,
  fetchSponsorListing,
  fetchSponsorListings,
  fetchSponsorSubmissions,
  publishListing,
  rejectSubmissions,
  saveListingDraft,
  toggleWinners,
  updateListing,
} from "@/features/earn/lib/api/sponsor-dashboard";
import { LISTING_KEYS } from "@/features/earn/hooks/use-earn-listings";
import type { ListingType, WinnerSelection } from "@/features/earn/lib/api/types";
import type { ListingPayload } from "@/features/earn/lib/listing-form";

export const SPONSOR_LISTING_KEYS = {
  createAllowed: ["earn", "sponsor-dashboard", "create-allowed"] as const,
  all: ["earn", "sponsor-dashboard", "listings"] as const,
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

// Everything this sponsor owns, published and draft alike. The drafts screen
// splits them; nothing here filters, so one fetch serves both views.
export function useSponsorListings() {
  const query = useQuery({
    queryKey: SPONSOR_LISTING_KEYS.all,
    queryFn: fetchSponsorListings,
  });

  return {
    listings: query.data ?? [],
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
      // A new draft has to show up on the drafts screen without a reload.
      void queryClient.invalidateQueries({ queryKey: SPONSOR_LISTING_KEYS.all });
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

// Funding is what lets a listing be published, so the sponsor's own views are
// stale afterwards: the draft becomes publishable and shows as backed.
export function useFundListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      txId,
      walletAddress,
    }: {
      id: string;
      txId: string;
      walletAddress?: string;
    }) => fundListing(id, txId, walletAddress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["earn", "sponsor-dashboard"] });
    },
  });
}

// What escrow still holds. Polled while a listing owes its winners, since the
// release may land after the page is already open.
export function useEscrowStatus(listingId: string | null) {
  const query = useQuery({
    queryKey: ["earn", "escrow-status", listingId],
    queryFn: () => fetchEscrowStatus(listingId as string),
    enabled: !!listingId,
  });

  return { status: query.data ?? null, isLoading: query.isLoading };
}

// Paying the winners changes what escrow holds and what every entrant sees.
export function useReleaseEscrow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => releaseEscrow(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["earn", "escrow-status"] });
      void queryClient.invalidateQueries({ queryKey: ["earn", "sponsor-dashboard"] });
    },
  });
}

// Both review actions take the listing slug so the feed they changed can be
// refetched. The service's response carries no listing, so the caller names it.
// Announcing changes what every entrant sees, so the public listing and the
// submission feed are both stale afterwards.
export function useAnnounceWinners(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => announceWinners(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["earn", "sponsor-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["earn", "listings"] });
      void queryClient.invalidateQueries({ queryKey: SPONSOR_LISTING_KEYS.submissions(slug) });
    },
  });
}

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
