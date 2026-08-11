"use client";

// The sponsor side: creating and publishing listings, then reviewing what came
// in. Every call here is forwarded with an `x-sponsor-id` that the proxy
// resolved from the session, so nothing in this file names a sponsor.

import { earnAuthedGet, earnPost } from "@/features/earn/lib/api/client";
import {
  toListing,
  toSponsorListings,
  toSubmissions,
  type ListingWire,
  type SubmissionWire,
} from "@/features/earn/lib/api/wire";
import type {
  Listing,
  ListingType,
  SponsorListing,
  Submission,
  WinnerSelection,
} from "@/features/earn/lib/api/types";
import {
  FIXTURE_SPONSOR_LISTINGS,
  FIXTURE_SUBMISSIONS,
  USE_FIXTURES,
  fixtureListing,
} from "@/features/earn/lib/api/fixtures";
import type { ListingPayload } from "@/features/earn/lib/listing-form";
import type { EscrowQuote } from "@/features/earn/lib/escrow";

type SubmissionFeed = SubmissionWire[] | { submissions?: SubmissionWire[] } | null;
type ListingFeed = ListingWire[] | { listings?: ListingWire[] } | null;

function submissionsOf(data: SubmissionFeed): SubmissionWire[] {
  if (Array.isArray(data)) return data;
  return data?.submissions ?? [];
}

function listingsOf(data: ListingFeed): ListingWire[] {
  if (Array.isArray(data)) return data;
  return data?.listings ?? [];
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

// Every listing this sponsor owns, drafts included. The public feed carries
// only published work, so this is the one call that can see a draft without
// already knowing its slug.
export async function fetchSponsorListings(): Promise<SponsorListing[]> {
  if (USE_FIXTURES) return FIXTURE_SPONSOR_LISTINGS;
  const data = await earnAuthedGet<ListingFeed>("/sponsor-dashboard/listings");
  return toSponsorListings(listingsOf(data));
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
  const data = await earnAuthedGet<SubmissionFeed>(
    `/sponsor-dashboard/${encodeURIComponent(slug)}/submissions`
  );
  return toSubmissions(submissionsOf(data));
}

// What the sponsor's wallet needs in order to deposit: where to send it, the
// contract's own id for this listing, and an amount and deadline the contract
// will accept. Derived by the service so the client cannot drift from the
// rules the contract enforces.
export async function fetchEscrowQuote(
  id: string,
  // The connected wallet. Sent because the account may have no address
  // recorded yet, and without one the quote cannot tell whether the contract
  // already holds this sponsor's deposit.
  walletAddress?: string
): Promise<EscrowQuote> {
  return earnAuthedGet<EscrowQuote>(
    `/sponsor-dashboard/listing/${encodeURIComponent(id)}/escrow-quote`,
    walletAddress ? { walletAddress } : undefined
  );
}

// Records the escrow deposit that backs a listing's reward. Only the
// transaction hash is sent: the service reads the amount, the token and the
// recipient back off Base, so nothing here is taken on trust. A listing cannot
// be published until this succeeds.
export async function fundListing(
  id: string,
  txId: string,
  // Sent so a first-time funder's account has an address to verify against.
  // The service ignores it once the account has one recorded.
  walletAddress?: string
): Promise<void> {
  if (USE_FIXTURES) return;
  await earnPost<unknown>(`/sponsor-dashboard/listing/${encodeURIComponent(id)}/fund`, {
    txId,
    ...(walletAddress ? { walletAddress } : {}),
  });
}

export interface EscrowStatus {
  configured: boolean;
  state?: "None" | "Funded" | "Released" | "Refunded";
  // Winners were announced but the money is still held: somebody is owed.
  owesWinners?: boolean;
  winnersWithoutWallet?: number;
  refundableAfter?: string | null;
}

// What escrow still holds for a listing. Read from the contract rather than our
// own record, because the two can differ and the contract is the one that
// decides where the money is.
export async function fetchEscrowStatus(id: string): Promise<EscrowStatus> {
  if (USE_FIXTURES) return { configured: false };
  return earnAuthedGet<EscrowStatus>(
    `/sponsor-dashboard/listing/${encodeURIComponent(id)}/escrow-status`
  );
}

export interface ReleaseReport {
  released: boolean;
  reason: string;
  txId?: string;
  unpaidWinners: string[];
}

// Pays the announced winners. Safe to call again: the contract knows what it
// has already paid, so a release that did nothing can simply be retried.
export async function releaseEscrow(id: string): Promise<ReleaseReport> {
  return earnPost<ReleaseReport>(`/sponsor-dashboard/listing/${encodeURIComponent(id)}/release`);
}

// Publishes the result. Until this runs the winners are only marked internally:
// `winnersAnnounced` stays false, so nobody who entered is told how they did.
// The service refuses a second announce, and refuses one where the marked
// winners do not cover every prize position.
export async function announceWinners(id: string): Promise<void> {
  if (USE_FIXTURES) return;
  await earnPost<unknown>(`/sponsor-dashboard/listing/${encodeURIComponent(id)}/announce`);
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
