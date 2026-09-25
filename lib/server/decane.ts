import "server-only";

import { DecaneApiError, DecaneClient } from "decane-node";

let client: DecaneClient | null = null;

// Decane verifies access tokens against its published JWKS (or the optional
// DECANE_VERIFICATION_KEY env var, which decane-node picks up on its own), so
// unlike Privy there is no app secret to hold here.
export function getDecaneClient(): DecaneClient {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_DECANE_APP_ID;
  if (!appId) {
    throw new Error("Decane is not configured. Set NEXT_PUBLIC_DECANE_APP_ID.");
  }
  client = new DecaneClient({ appId });
  return client;
}

export function decaneConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DECANE_APP_ID);
}

// ── The user's preferences record on Decane ──────────────────────────────────
//
// Decane keeps a flat per-user `preferences` record (strings, numbers and
// booleans under short keys), written with the user's own access token. It is
// what Privy's custom metadata was for the account-stored settings here —
// Shine and the consent record — now that a Decane session has no Privy user
// to hang them on. decane-node 1.4.0 makes the two calls; this wraps them so
// a route can tell "the token was refused" (sign in again) from "Decane is
// down" (try later) by one status, whichever call it was.

export type DecaneRecord = Record<string, string | number | boolean>;
export type DecaneRecordPatch = Record<string, string | number | boolean | null>;

export class DecanePreferencesError extends Error {
  constructor(
    message: string,
    /** The HTTP status Decane answered, or 0 when the request never completed. */
    public readonly status: number
  ) {
    super(message);
    this.name = "DecanePreferencesError";
  }
}

async function preferencesCall(call: () => Promise<DecaneRecord>): Promise<DecaneRecord> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof DecaneApiError) {
      throw new DecanePreferencesError(error.message, error.status);
    }
    throw new DecanePreferencesError(`Decane unreachable: ${String(error)}`, 0);
  }
}

/** The token owner's preferences. `{}` for an account that never wrote any. */
export function readDecanePreferences(token: string): Promise<DecaneRecord> {
  return preferencesCall(() => getDecaneClient().getPreferences(token));
}

/**
 * Merges into the token owner's preferences: each key is set, or removed when
 * its value is null; keys not named stay. Resolves to the whole record
 * afterwards, which is what a caller should answer with rather than what it
 * guessed the record would hold.
 */
export function updateDecanePreferences(
  token: string,
  patch: DecaneRecordPatch
): Promise<DecaneRecord> {
  return preferencesCall(() => getDecaneClient().updatePreferences(token, patch));
}
