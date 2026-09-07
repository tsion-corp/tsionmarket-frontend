"use client";

import { getAccessToken, getIdentityToken } from "@privy-io/react-auth";
import { peekHeldIdentityToken } from "@/lib/privy-identity-store";

// Privy's getAccessToken() returns a cached JWT and only hits the network when
// the token is near expiry, so calling it per request is cheap. getIdentityToken()
// is not: in v3 it GETs Privy's /users/me on every call, whatever it holds. A
// dashboard mount fires many authed requests at once (portfolio, catalog
// prefetch, per-block invalidations), so an uncached identity token means a
// burst of /users/me calls that trips Privy's rate limit (HTTP 429).
//
// Two things keep /users/me off the hot path:
//
// 1. The SDK already issues a fresh identity token on login, page load,
//    account link and every access-token refresh, and holds it where the
//    useIdentityToken hook can read it with no network call. The resolver
//    reads that first (mirrored by IdentityTokenBridge) and calls Privy only
//    when nothing usable is held.
// 2. When it does call Privy and the call fails, it backs off. It used to
//    leave nothing behind on failure, so the next caller, and every poller and
//    query retry after it, called /users/me again at once; under a 429 that is
//    a loop that keeps the limit tripped. Failures now wait 1s, 2s, 4s… up to
//    a minute, a rate limit waits the full minute, and a still-valid token
//    keeps being served meanwhile.

export interface AuthTokens {
  accessToken: string | null;
  idToken: string | null;
}

interface TokenResolverDeps {
  getAccessToken: () => Promise<string | null>;
  getIdentityToken: () => Promise<string | null>;
  // The identity token the SDK holds right now, if any, read without a
  // network call. Defaults to the store IdentityTokenBridge fills.
  peekIdentityToken?: () => string | null;
  // Current time in seconds since epoch. Injected so tests can control expiry.
  now?: () => number;
}

// Refresh the identity token this many seconds before it actually expires, so a
// request never carries a token that lapses in flight.
const REFRESH_SKEW_SECONDS = 60;

// When a token's expiry can't be read, cache it briefly instead of refreshing
// on every request.
const FALLBACK_TTL_SECONDS = 300;

// Privy can expose the access token before the identity token during session
// startup. Back off briefly, then try again instead of caching that transient
// absence for the full fallback TTL. Each further failure doubles the wait.
const FIRST_RETRY_SECONDS = 1;
const MAX_RETRY_SECONDS = 60;

// A rate limit does not clear by asking again sooner.
const RATE_LIMIT_RETRY_SECONDS = 60;

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|too many requests|rate limit/i.test(message);
}

// Reads a JWT's payload without verifying its signature. Returns null for
// anything that is not a well-formed JWT with a JSON payload.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(base64));
    return payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// The `exp` claim (seconds since epoch), or null when it cannot be read, so
// callers treat it as "needs refresh / unknown".
export function decodeJwtExp(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
}

// The `sub` claim, the user's DID on both Privy tokens, or null when unreadable.
export function decodeJwtSub(token: string): string | null {
  const sub = decodeJwtPayload(token)?.sub;
  return typeof sub === "string" && sub !== "" ? sub : null;
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
  peekIdentityToken = peekHeldIdentityToken,
  now = () => Date.now() / 1000,
}: TokenResolverDeps): () => Promise<AuthTokens> {
  let cache: CacheEntry | null = null;
  // Shared in-flight refresh, so a burst of concurrent callers makes one
  // getIdentityToken() call rather than one each.
  let inflight: Promise<string | null> | null = null;
  // Consecutive failed refreshes, and the time before which none is attempted.
  let failures = 0;
  let retryAt = 0;

  // A token is attached only while it has time left and, when both tokens
  // name a user, only when it names the same user as the access token. The
  // SDK can move its store straight from one user's token to the next's, and
  // a new sign-in can land before the bridge has cleared the old one; either
  // way the wrong user's identity token must never go out.
  const usable = (token: string | null, expiresAt: number, access: string): token is string => {
    if (token === null || expiresAt - REFRESH_SKEW_SECONDS <= now()) return false;
    const accessSub = decodeJwtSub(access);
    const tokenSub = decodeJwtSub(token);
    return accessSub === null || tokenSub === null || accessSub === tokenSub;
  };

  // The best token that needs no network call: what the SDK holds, else what a
  // previous refresh returned, as long as either is usable under this access
  // token.
  const heldToken = (access: string): string | null => {
    const held = peekIdentityToken();
    if (held) {
      const exp = decodeJwtExp(held) ?? now() + FALLBACK_TTL_SECONDS;
      if (usable(held, exp, access)) return held;
    }
    return cache && usable(cache.idToken, cache.idExpiresAt, access) ? cache.idToken : null;
  };

  return async function resolveTokens(): Promise<AuthTokens> {
    const access = await getAccessToken();

    // No access token means signed out, or the session is not warm yet. Drop any
    // cached identity token so a later session can never reuse a stale one, and
    // the back-off with it: a new session should not wait out the old one's
    // failures.
    if (!access) {
      cache = null;
      failures = 0;
      retryAt = 0;
      return { accessToken: null, idToken: null };
    }

    const held = heldToken(access);
    // The SDK's own token, or one fetched under this same access token, needs
    // no refresh. One fetched under an earlier access token is refreshed when
    // the session rotates, so the two stay together, unless that refresh is
    // currently failing, in which case it is still served below.
    if (held && (peekIdentityToken() === held || cache?.access === access)) {
      return { accessToken: access, idToken: held };
    }
    // A recent "not ready" answer under this access token is trusted until its
    // short retry window ends.
    if (cache && cache.access === access && cache.idToken === null && cache.idExpiresAt > now()) {
      return { accessToken: access, idToken: null };
    }
    if (retryAt > now()) {
      return { accessToken: access, idToken: held };
    }

    if (inflight === null) {
      inflight = (async () => {
        try {
          const idToken = await getIdentityToken();
          const exp = idToken ? decodeJwtExp(idToken) : null;
          if (idToken) {
            failures = 0;
            retryAt = 0;
            cache = { access, idToken, idExpiresAt: exp ?? now() + FALLBACK_TTL_SECONDS };
          } else {
            failures += 1;
            const wait = Math.min(FIRST_RETRY_SECONDS * 2 ** (failures - 1), MAX_RETRY_SECONDS);
            cache = { access, idToken: null, idExpiresAt: now() + wait };
            retryAt = now() + wait;
          }
          return idToken;
        } catch (error) {
          failures += 1;
          const wait = isRateLimit(error)
            ? RATE_LIMIT_RETRY_SECONDS
            : Math.min(FIRST_RETRY_SECONDS * 2 ** (failures - 1), MAX_RETRY_SECONDS);
          retryAt = now() + wait;
          console.warn(
            `Privy identity token refresh failed; next attempt in ${wait}s`,
            error instanceof Error ? error.message : error
          );
          return null;
        } finally {
          inflight = null;
        }
      })();
    }

    const refreshed = await inflight;
    return { accessToken: access, idToken: refreshed ?? heldToken(access) };
  };
}

// The app-wide resolver, backed by the real Privy getters.
export const resolveAuthTokens = createTokenResolver({ getAccessToken, getIdentityToken });
