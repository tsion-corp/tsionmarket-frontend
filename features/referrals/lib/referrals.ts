"use client";

// Transport and domain types for usernames and referrals, served by the Kash
// engine through our same-origin proxy. A username doubles as the referral
// code: the invite link is /r/<username>, and a referral counts once the
// invited wallet makes its first deposit after claiming.

import { createServiceClient } from "@/lib/api/service";

const kash = createServiceClient("/api/kash", "Referrals are unavailable right now.");

// Mirrors the engine's rule exactly: 3 to 20 characters, lowercase letters,
// digits and underscores, starting with a letter.
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export type UsernameProblem = "too_short" | "too_long" | "invalid_characters" | null;

export function usernameProblem(name: string): UsernameProblem {
  if (name.length < 3) return "too_short";
  if (name.length > 20) return "too_long";
  return USERNAME_PATTERN.test(name) ? null : "invalid_characters";
}

// Keeps typed input inside the allowed alphabet as the user types, so the
// only feedback left for the checker is length, the leading character, and
// whether the name is taken.
export function sanitizeUsernameInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

// The progress bar's rolling milestone: the next multiple of ten, so the bar
// always has somewhere to go. 0..9 referred aim at 10, 10..19 at 20, and so on.
export function referralGoal(referred: number): number {
  if (referred < 10) return 10;
  return Math.ceil((referred + 1) / 10) * 10;
}

export function inviteLink(origin: string, username: string): string {
  return `${origin}/r/${username}`;
}

// The link as the comp shows it: no protocol, just the part worth reading.
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
  reason?: string;
}

export interface ReferralStats {
  wallet: string;
  username: string | null;
  referred: number;
  pending: number;
}

export function getUsernameAvailability(username: string): Promise<UsernameAvailability> {
  return kash.get(`/usernames/${encodeURIComponent(username)}/available`);
}

export function getMyReferralStats(): Promise<ReferralStats> {
  return kash.authedGet("/referrals/me");
}

export function putUsername(username: string): Promise<{ wallet: string; username: string }> {
  return kash.put("/profiles/me/username", { username });
}

export function postReferralClaim(
  code: string
): Promise<{ referrerWallet: string; code: string; claimedAt: string }> {
  return kash.post("/referrals/claim", { code });
}
