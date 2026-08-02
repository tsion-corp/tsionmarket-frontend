"use client";

// The sponsor side: creating and publishing listings, then reviewing what came
// in. Every call here is forwarded with an `x-sponsor-id` that the proxy
// resolved from the session, so nothing in this file names a sponsor.

import { earnAuthedGet, earnPost } from "@/lib/earn/api/client";
import {
  toListing,
  toSubmissions,
  type ListingWire,
  type SubmissionWire,
} from "@/lib/earn/api/wire";
import type { Listing, ListingType, Submission, WinnerSelection } from "@/lib/earn/api/types";
import { FIXTURE_SUBMISSIONS, USE_FIXTURES, fixtureListing } from "@/lib/earn/api/fixtures";
import type { ListingPayload } from "@/lib/earn/listing-form";

type FeedResponse = SubmissionWire[] | { submissions?: SubmissionWire[] } | null;

function submissionsOf(data: FeedResponse): SubmissionWire[] {
  if (Array.isArray(data)) return data;
  return data?.submissions ?? [];
}

export async function fetchIsCreateAllowed(): Promise<boolean> {
  if (USE_FIXTURES) return true;
  const data = await earnAuthedGet<boolean | { allowed?: boolean; isCreateAllowed?: boolean }>(
    "/sponsor-dashboard/listings/is-create-allowed"
  );
  if (typeof data === "boolean") return data;
  if (typeof data?.allowed === "boolean") return data.allowed;
  return data?.isCreateAllowed !== false;
}

// Saves a draft, creating it on the first call and updating it after. The
// service answers with the listing, which is where the id for publish comes
// from, so the caller must keep what this returns.
export async function saveListingDraft(payload: ListingPayload): Promise<Listing> {
  // Echoes the draft back so the editor can move on to publish; nothing is
  // stored while the service is down.
  if (USE_FIXTURES)
    return { ...fixtureListing(payload.slug), title: payload.title, slug: payload.slug };
  const listing = toListing(
    await earnPost<ListingWire>("/sponsor-dashboard/listing/draft", payload)
  );
  if (!listing) throw new Error("The draft was saved but could not be read back.");
  return listing;
}

export async function publishListing(id: string): Promise<Listing | null> {
  if (USE_FIXTURES) return null;
  return toListing(
    await earnPost<ListingWire>(`/sponsor-dashboard/listing/${encodeURIComponent(id)}/publish`)
  );
}

export async function updateListing(id: string, payload: ListingPayload): Promise<Listing | null> {
  if (USE_FIXTURES) return null;
  return toListing(
    await earnPost<ListingWire>(
      `/sponsor-dashboard/listing/${encodeURIComponent(id)}/update`,
      payload
    )
  );
}

export async function fetchSponsorListing(slug: string, type: ListingType): Promise<Listing> {
  if (USE_FIXTURES) return fixtureListing(slug);
  const data = await earnAuthedGet<ListingWire>(
    `/sponsor-dashboard/${encodeURIComponent(slug)}/listing`,
    { type }
  );
  const listing = toListing(data);
  if (!listing) throw new Error("That listing could not be read.");
  return listing;
}

export async function fetchSponsorSubmissions(slug: string): Promise<Submission[]> {
  if (USE_FIXTURES) return FIXTURE_SUBMISSIONS;
  const data = await earnAuthedGet<FeedResponse>(
    `/sponsor-dashboard/${encodeURIComponent(slug)}/submissions`
  );
  return toSubmissions(submissionsOf(data));
}

export async function rejectSubmissions(ids: string[]): Promise<void> {
  if (USE_FIXTURES) return;
  await earnPost<unknown>("/sponsor-dashboard/submission/reject", {
    data: ids.map((id) => ({ id })),
  });
}

export async function toggleWinners(selections: WinnerSelection[]): Promise<void> {
  if (USE_FIXTURES) return;
  await earnPost<unknown>("/sponsor-dashboard/submission/toggle-winner", {
    submissions: selections,
  });
}
