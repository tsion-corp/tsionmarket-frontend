"use client";

import { getAccessToken, getIdentityToken } from "@privy-io/react-auth";

// Privy's getAccessToken() returns a cached JWT and only hits the network when
// the token is near expiry, so calling it per request is cheap. getIdentityToken()
// is not: in v3 it refreshes the session by calling Privy's /users/me endpoint
// every time. A dashboard mount fires many authed requests at once (portfolio,
// catalog prefetch, per-block invalidations), so an uncached identity token means
// a burst of /users/me calls that trips Privy's rate limit (HTTP 429).
//
// This module caches the identity token and only refreshes it when the access
// token rotates or the identity token is near expiry, and it collapses a burst
// of concurrent refreshes into a single call. The result is one /users/me per
// token lifetime (~hourly) instead of one per request.

export interface AuthTokens {
  accessToken: string | null;
  idToken: string | null;
}

interface TokenResolverDeps {
  getAccessToken: () => Promise<string | null>;
  getIdentityToken: () => Promise<string | null>;
  // Current time in seconds since epoch. Injected so tests can control expiry.
  now?: () => number;
}

// Refresh the identity token this many seconds before it actually expires, so a
// request never carries a token that lapses in flight.
const REFRESH_SKEW_SECONDS = 60;

// When a token's expiry can't be read (or there is no identity token at all),
// cache the decision for this long so we don't fall back to refreshing on every
// call, which would defeat the purpose.
const FALLBACK_TTL_SECONDS = 300;

// Reads the `exp` claim (seconds since epoch) from a JWT without verifying its
// signature. Returns null for anything that is not a well-formed JWT with a
// numeric exp, so callers treat it as "needs refresh / unknown".
export function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

interface CacheEntry {
  // The access token this identity token was fetched alongside. If the access
  // token rotates, the identity token is refreshed to stay in the same session.
  access: string;
  idToken: string | null;
  // Seconds since epoch after which the identity token must be refreshed.
  idExpiresAt: number;
}

// Builds a token resolver over injected getters. The real one is exported below;
// tests build their own with fakes.
export function createTokenResolver({
  getAccessToken,
  getIdentityToken,
  now = () => Date.now() / 1000,
}: TokenResolverDeps): () => Promise<AuthTokens> {
  let cache: CacheEntry | null = null;
  // Shared in-flight refresh, so a burst of concurrent callers makes one
  // getIdentityToken() call rather than one each.
  let inflight: Promise<CacheEntry> | null = null;

  return async function resolveTokens(): Promise<AuthTokens> {
    const access = await getAccessToken();

    // No access token means signed out, or the session is not warm yet. Drop any
    // cached identity token so a later session can never reuse a stale one.
    if (!access) {
      cache = null;
      return { accessToken: null, idToken: null };
    }

    const fresh =
      cache !== null && cache.access === access && cache.idExpiresAt - REFRESH_SKEW_SECONDS > now();
    if (fresh) {
      return { accessToken: access, idToken: cache!.idToken };
    }

    if (inflight === null) {
      inflight = (async () => {
        try {
          const idToken = await getIdentityToken();
          const exp = idToken ? decodeJwtExp(idToken) : null;
          const entry: CacheEntry = {
            access,
            idToken,
            idExpiresAt: exp ?? now() + FALLBACK_TTL_SECONDS,
          };
          cache = entry;
          return entry;
        } finally {
          inflight = null;
        }
      })();
    }

    const entry = await inflight;
    return { accessToken: access, idToken: entry.idToken };
  };
}

// The app-wide resolver, backed by the real Privy getters.
export const resolveAuthTokens = createTokenResolver({ getAccessToken, getIdentityToken });
