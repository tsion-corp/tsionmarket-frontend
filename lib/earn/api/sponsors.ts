"use client";

// Sponsor setup: availability checks while the sign-up form is being typed,
// then creating the company and completing the owner's profile.

import { earnGet, earnPost } from "@/lib/earn/api/client";
import { toSponsor, type SponsorWire } from "@/lib/earn/api/wire";
import { FIXTURE_SPONSOR, USE_FIXTURES } from "@/lib/earn/api/fixtures";
import type { CreateSponsorInput, Sponsor, SponsorProfileInput } from "@/lib/earn/api/types";

// The check endpoints answer with a flag whose name is not pinned by the
// contract. Treat an explicit "taken" as taken and anything else as available,
// so a rename makes the form permissive rather than blocking every name. The
// service revalidates on create either way.
type AvailabilityResponse = { available?: boolean; taken?: boolean } | boolean | null;

function isAvailable(data: AvailabilityResponse): boolean {
  if (typeof data === "boolean") return data;
  if (typeof data?.available === "boolean") return data.available;
  if (typeof data?.taken === "boolean") return !data.taken;
  return true;
}

export async function checkSponsorName(name: string): Promise<boolean> {
  if (USE_FIXTURES) return true;
  return isAvailable(await earnGet<AvailabilityResponse>("/sponsors/check-name", { name }));
}

export async function checkSponsorSlug(slug: string): Promise<boolean> {
  if (USE_FIXTURES) return true;
  return isAvailable(await earnGet<AvailabilityResponse>("/sponsors/check-slug", { slug }));
}

// The caller's current sponsor, or null when they have not created one. A user
// with no sponsor is the normal first-visit state, not an error, so the 403 the
// service answers with is turned into null here.
export async function fetchCurrentSponsor(): Promise<Sponsor | null> {
  if (USE_FIXTURES) return FIXTURE_SPONSOR;
  try {
    return toSponsor(await earnGet<SponsorWire>("/sponsors"));
  } catch (error) {
    if (isNoSponsor(error)) return null;
    throw error;
  }
}

function isNoSponsor(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "FORBIDDEN" || code === "NOT_FOUND";
}

export async function createSponsor(input: CreateSponsorInput): Promise<Sponsor | null> {
  // Nothing is persisted while the service is down, so the form completes and
  // the flow can be walked end to end without pretending an account exists.
  if (USE_FIXTURES) return null;
  return toSponsor(await earnPost<SponsorWire>("/sponsors/create", input));
}

export async function saveSponsorProfile(input: SponsorProfileInput): Promise<void> {
  if (USE_FIXTURES) return;
  await earnPost<unknown>("/sponsors/usersponsor-details", input);
}
