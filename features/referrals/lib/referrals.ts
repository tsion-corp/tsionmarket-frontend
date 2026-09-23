"use client";

// Transport and domain types for usernames and referrals, served by the Kash
// engine through our same-origin proxy. A username doubles as the referral
// code: the invite link is /r/<username>, and a referral counts once the
// invited wallet makes its first deposit after claiming.

import { createServiceClient } from "@/lib/api/service";
import { truncateAddress } from "@/lib/format";

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

// The bar never caps: it fills across the current lap of ten toward the next
// milestone, then starts a new lap. 12 referred reads 12/20 with a fifth of
// the lap done. Never fully empty, so a fresh lap still shows the comp's nub.
export function referralProgress(referred: number): { goal: number; pct: number } {
  const goal = referralGoal(referred);
  const lapStart = goal - 10;
  const pct = Math.max(4, Math.min(100, ((referred - lapStart) / 10) * 100));
  return { goal, pct };
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
  /**
   * The invited people themselves, which the engine does not send yet.
   *
   * `/referrals/me` answers with the two counts above and nothing else, so the
   * Active/Inactive lists have no rows to draw until it also returns who was
   * invited. Optional rather than absent so the moment the engine adds the
   * field the lists fill in on their own, with no further change here.
   */
  referrals?: ReferralEntry[];
}

/**
 * Counted is a referral that has paid out: joined through the link AND made a
 * first deposit of at least $1. Pending is joined but not yet deposited. Those
 * are the two states the comp draws as "Counted" and "Deposit Pending".
 */
export type ReferralStatus = "counted" | "deposit_pending";

export interface ReferralEntry {
  /** The invitee's claimed username, absent until they claim one. */
  username: string | null;
  /** The invitee's wallet, which is what names the row when there is no username. */
  wallet: string;
  status: ReferralStatus;
}

/**
 * The two lists behind the Active / Inactive tabs.
 *
 * Split here rather than in the component so the rule is one testable place,
 * and so an unknown status from the engine cannot silently land in the wrong
 * tab: only an explicit "counted" is active.
 */
export function splitReferrals(entries: readonly ReferralEntry[] | undefined): {
  active: ReferralEntry[];
  inactive: ReferralEntry[];
} {
  const list = entries ?? [];
  return {
    active: list.filter((entry) => entry.status === "counted"),
    inactive: list.filter((entry) => entry.status !== "counted"),
  };
}

/**
 * What names a row. The comp writes a handle as `@name`, but an invitee who
 * never claimed a username has no name to write, so the row falls back to
 * their truncated wallet. Truncated, not full: 42 characters do not fit the
 * row and the short form is enough to tell two invitees apart.
 */
export function referralHandle(entry: ReferralEntry): string {
  return entry.username ? `@${entry.username}` : truncateAddress(entry.wallet);
}

export function getUsernameAvailability(username: string): Promise<UsernameAvailability> {
  return kash.get(`/usernames/${encodeURIComponent(username)}/available`);
}

export function getMyReferralStats(): Promise<ReferralStats> {
  return kash.authedGet("/referrals/me");
}

/**
 * A generation of the caller's network: how many people it holds and how many
 * of those have counted (joined through a link AND deposited).
 */
export interface GenerationCount {
  generation: number;
  total: number;
  counted: number;
}

/** The caller's own network, as `/referrals/me/network` answers it. */
export interface ReferralNetwork {
  wallet: string;
  username: string | null;
  joinedAt: string | null;
  qualified: boolean;
  downline: { total: number; counted: number };
  generations: GenerationCount[];
}

/** One person in the caller's downline. */
export interface NetworkPerson {
  wallet: string;
  username: string | null;
  claimedAt: string | null;
  qualified: boolean;
}

export interface NetworkPage {
  people: NetworkPerson[];
  nextCursor: string | null;
}

/** The empty network, for a wallet the engine has no node for. */
export const EMPTY_NETWORK: ReferralNetwork = {
  wallet: "",
  username: null,
  joinedAt: null,
  qualified: false,
  downline: { total: 0, counted: 0 },
  generations: [],
};

export function getMyReferralNetwork(): Promise<ReferralNetwork> {
  return kash.authedGet("/referrals/me/network");
}

export function getMyDownline(generation: number, cursor?: string | null): Promise<NetworkPage> {
  const params = new URLSearchParams({ generation: String(generation) });
  if (cursor) params.set("cursor", cursor);
  return kash.authedGet(`/referrals/me/downline?${params.toString()}`);
}

/** The name a row shows: their handle, or their truncated wallet. */
export function personHandle(person: NetworkPerson): string {
  return person.username ? `@${person.username}` : truncateAddress(person.wallet);
}

export function putUsername(username: string): Promise<{ wallet: string; username: string }> {
  return kash.put("/profiles/me/username", { username });
}

export function postReferralClaim(
  code: string
): Promise<{ referrerWallet: string; code: string; claimedAt: string }> {
  return kash.post("/referrals/claim", { code });
}
