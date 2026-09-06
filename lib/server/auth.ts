import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { getPrivyClient } from "@/lib/server/privy";

export interface AccessClaims {
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
}

// The cookie Privy's browser SDK sets alongside the access token it keeps in
// storage. Same-origin requests carry it, which is what lets a route handler
// and a Server Component verify the session without header plumbing.
export const ACCESS_TOKEN_COOKIE = "privy-token";
const IDENTITY_TOKEN_COOKIE = "privy-id-token";

const REQUEST_USER_CACHE_TTL_MS = 60_000;
const REQUEST_USER_CACHE_MAX_ENTRIES = 1_000;

interface CachedRequestUser {
  user: User;
  expiresAt: number;
}

const requestUserCache = new Map<string, CachedRequestUser>();
const requestUserLoads = new Map<string, Promise<User | null>>();

function requestUserCacheKey(claims: AccessClaims): string {
  return `${claims.userId}:${claims.sessionId}`;
}

function cachedRequestUser(key: string): User | null {
  const cached = requestUserCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    requestUserCache.delete(key);
    return null;
  }
  requestUserCache.delete(key);
  requestUserCache.set(key, cached);
  return cached.user;
}

function cacheRequestUser(key: string, user: User): void {
  if (requestUserCache.size >= REQUEST_USER_CACHE_MAX_ENTRIES) {
    const oldest = requestUserCache.keys().next().value;
    if (oldest) requestUserCache.delete(oldest);
  }
  requestUserCache.set(key, { user, expiresAt: Date.now() + REQUEST_USER_CACHE_TTL_MS });
}

function extractAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

// Verifies a Privy access token. Returns null when it fails verification.
// Shared by the request path below and the cookie path Server Components use
// (lib/server/session.ts), so both accept exactly the same tokens.
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(token);
    return {
      userId: claims.user_id,
      sessionId: claims.session_id,
      issuedAt: claims.issued_at,
      expiration: claims.expiration,
    };
  } catch {
    return null;
  }
}

// Verifies the caller's Privy access token. Returns null when the request
// carries no token or the token fails verification.
export async function verifyRequest(req: NextRequest): Promise<AccessClaims | null> {
  const token = extractAccessToken(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

async function loadUserById(userId: string): Promise<User | null> {
  try {
    return await getPrivyClient().users()._get(userId);
  } catch {
    return null;
  }
}

// The full Privy user behind a verified session, cached per session for a
// minute so a burst of authed requests on mount resolves it once.
//
// An identity token, when the client sent one, is only a shortcut: it is
// client-supplied, so it must name the same user the access token does.
// Otherwise a caller could pair their own session with someone else's identity
// token and the wallet gates in kash and perp would treat them as that wallet's
// owner. A mismatch is ignored and the verified user id is loaded instead.
export async function loadVerifiedUser(
  claims: AccessClaims,
  idToken?: string | null
): Promise<User | null> {
  const key = requestUserCacheKey(claims);
  const cached = cachedRequestUser(key);
  if (cached) return cached;

  const pending = requestUserLoads.get(key);
  if (pending) return pending;

  const load = async (): Promise<User | null> => {
    if (idToken) {
      try {
        const user = await getPrivyClient().users().get({ id_token: idToken });
        if (user.id === claims.userId) return user;
      } catch {
        // Fall through to the verified user id below.
      }
    }
    return loadUserById(claims.userId);
  };

  const request = load()
    .then((user) => {
      if (user) cacheRequestUser(key, user);
      return user;
    })
    .finally(() => requestUserLoads.delete(key));
  requestUserLoads.set(key, request);
  return request;
}

// Resolves the full Privy user for a request. With verified claims this is
// loadVerifiedUser; without them, the identity token alone identifies the
// user, which is how Privy intends that token to be used.
export async function getRequestUser(
  req: NextRequest,
  claims: AccessClaims | null = null
): Promise<User | null> {
  const idToken =
    req.headers.get(IDENTITY_TOKEN_COOKIE) ?? req.cookies.get(IDENTITY_TOKEN_COOKIE)?.value;
  if (claims) return loadVerifiedUser(claims, idToken);
  if (!idToken) return null;
  try {
    return await getPrivyClient().users().get({ id_token: idToken });
  } catch {
    return null;
  }
}
