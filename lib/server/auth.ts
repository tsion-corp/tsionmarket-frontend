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
  return req.cookies.get("privy-token")?.value ?? null;
}

// Verifies the caller's Privy access token. Returns null when the request
// carries no token or the token fails verification.
export async function verifyRequest(req: NextRequest): Promise<AccessClaims | null> {
  const token = extractAccessToken(req);
  if (!token) return null;
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

// Resolves the full Privy user from an identity token, when the client sent
// one. When the identity token is missing or cold, fall back to the verified
// user id so money-moving routes can still prove which wallet the session owns.
export async function getRequestUser(
  req: NextRequest,
  claims: AccessClaims | null = null
): Promise<User | null> {
  const idToken = req.headers.get("privy-id-token") ?? req.cookies.get("privy-id-token")?.value;
  const load = async (): Promise<User | null> => {
    if (idToken) {
      try {
        return await getPrivyClient().users().get({ id_token: idToken });
      } catch {
        // Fall through to the verified user id below.
      }
    }
    if (!claims) return null;
    try {
      return await getPrivyClient().users()._get(claims.userId);
    } catch {
      return null;
    }
  };

  if (!claims) return load();
  const key = requestUserCacheKey(claims);
  const cached = cachedRequestUser(key);
  if (cached) return cached;

  const pending = requestUserLoads.get(key);
  if (pending) return pending;

  const request = load()
    .then((user) => {
      if (user) cacheRequestUser(key, user);
      return user;
    })
    .finally(() => requestUserLoads.delete(key));
  requestUserLoads.set(key, request);
  return request;
}
