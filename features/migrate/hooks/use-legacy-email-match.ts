"use client";

import { usePrivy, type User } from "@privy-io/react-auth";
import { useDisplayProfile } from "@/lib/display-profile";

// The old account must be the SAME PERSON's. The backend already demands a
// live token from both sides, so nobody can link an account they do not
// control — but someone who controls two old accounts can link the wrong one,
// and then the sweep moves the wrong money. So whatever the two sides have in
// common must agree:
//
//   email     — Google or email sign-in on both sides. Case-insensitive:
//               providers disagree on capitalisation and Gmail ignores it.
//   X user id — X sign-in on both sides. The numeric id, not the handle: a
//               handle can be released and re-registered, an id cannot.
//   X handle  — only when an id is missing on either side (an older record).
//
// Only enforced when BOTH sides carry the same kind of identifier. Signing in
// to Decane with Google and to the old account with X is legitimate — the
// migration flow says "the same Google, X, email or passkey you used before"
// — and there is nothing to compare, so it is allowed through.

/** What one side can be recognised by. Any field may be empty. */
export interface Identity {
  email: string;
  xId: string;
  xHandle: string;
}

/** The old (Privy) account's identifiers, all "" before sign-in. */
export function legacyIdentity(user: User | null): Identity {
  return {
    email: user?.google?.email ?? user?.email?.address ?? "",
    xId: user?.twitter?.subject ?? "",
    xHandle: user?.twitter?.username ?? "",
  };
}

const norm = (s: string) => s.trim().toLowerCase();
const handle = (s: string) => norm(s).replace(/^@/, "");

/** The pure rule: true only when a shared kind of identifier is known on both sides and differs. */
export function identitiesMismatch(expected: Identity, actual: Identity): boolean {
  if (expected.email && actual.email) return norm(expected.email) !== norm(actual.email);
  if (expected.xId && actual.xId) return expected.xId.trim() !== actual.xId.trim();
  if (expected.xHandle && actual.xHandle)
    return handle(expected.xHandle) !== handle(actual.xHandle);
  return false;
}

/** How to name a side to the user: the email, else the handle. */
export function identityLabel(identity: Identity): string {
  if (identity.email) return identity.email;
  if (identity.xHandle) return `@${handle(identity.xHandle)}`;
  return "";
}

export interface LegacyEmailMatch {
  /** The Decane session's identifier, as the user would recognise it. */
  expected: string;
  /** The old account's, or "" before sign-in. */
  actual: string;
  mismatch: boolean;
}

export function useLegacyEmailMatch(): LegacyEmailMatch {
  const { authenticated, user } = usePrivy();
  const profile = useDisplayProfile();
  const expected: Identity = {
    email: profile?.email ?? "",
    xId: profile?.providerSubject ?? "",
    xHandle: profile?.username ?? "",
  };
  const actual = authenticated ? legacyIdentity(user) : { email: "", xId: "", xHandle: "" };
  return {
    expected: identityLabel(expected),
    actual: identityLabel(actual),
    mismatch: identitiesMismatch(expected, actual),
  };
}
