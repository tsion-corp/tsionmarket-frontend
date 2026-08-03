"use client";

// The caller's own earn account.
//
// Entering a listing requires a completed talent profile: the service refuses
// a submission from an account where `isTalentFilled` is false. Nothing else in
// the app sets it, so this is the only path from "signed in" to "able to enter
// a bounty".

import { earnAuthedGet, earnPost } from "@/lib/earn/api/client";
import { toTalentProfile, type TalentProfileWire } from "@/lib/earn/api/wire";
import { FIXTURE_TALENT_PROFILE, USE_FIXTURES } from "@/lib/earn/api/fixtures";
import type { TalentProfile, TalentProfileInput } from "@/lib/earn/api/types";

// Null when the account has not been provisioned yet, which reads the same as
// an empty profile to every screen that asks.
export async function fetchTalentProfile(): Promise<TalentProfile | null> {
  if (USE_FIXTURES) return FIXTURE_TALENT_PROFILE;
  try {
    return toTalentProfile(await earnAuthedGet<TalentProfileWire>("/user/profile"));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "NOT_FOUND") return null;
    throw error;
  }
}

export async function completeTalentProfile(
  input: TalentProfileInput
): Promise<TalentProfile | null> {
  if (USE_FIXTURES) return FIXTURE_TALENT_PROFILE;
  return toTalentProfile(await earnPost<TalentProfileWire>("/user/complete-profile", input));
}
