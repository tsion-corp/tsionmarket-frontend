import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { getPrivyClient } from "@/lib/server/privy";
import { decaneConfigured, getDecaneClient } from "@/lib/server/decane";

export interface AccessClaims {
  /**
   * Which issuer verified this token. Callers branch on it rather than
   * re-deriving it from the id's shape: a Privy DID and a Decane UUID look
   * nothing alike, but guessing from the string is exactly the kind of check
   * that rots. Mirrors IdentityContext.provider in the backend's shared
   * verifier.
   */
  provider: "privy" | "decane";
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
}

// The cookie Privy's browser SDK sets alongside the access token it keeps in
// storage. Same-origin requests carry it, which is what lets a route handler
// and a Server Component verify the session without header plumbing.
export const ACCESS_TOKEN_COOKIE = "privy-token";

// Decane holds its access token in memory and hands it to apiFetch as a Bearer
// header. That covers every fetch — but not a document navigation. The chess
// board is an <iframe src="/api/chess/play">, and a browser attaches no
// Authorization header to one; only cookies travel. Privy set its own cookie,
// which is why the iframe authenticated before the migration and arrived
// anonymous after it. This is the same mechanism for the new session, written
// client-side by DecaneTokenBridge.
export const DECANE_ACCESS_TOKEN_COOKIE = "decane-token";

// The session token a cookie jar carries, whichever provider wrote it. One
// helper so the three readers (this module, lib/server/session, the chess
// proxy's forwardAuthHeaders) cannot drift apart.
export function accessTokenFromCookie(read: (name: string) => string | undefined): string | null {
  return read(ACCESS_TOKEN_COOKIE) ?? read(DECANE_ACCESS_TOKEN_COOKIE) ?? null;
}
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

/** The caller's access token as sent: the bearer header, or the cookie the client bridge sets. */
export function extractAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return accessTokenFromCookie((name) => req.cookies.get(name)?.value);
}

// Verifies a Privy access token on its own, for the migration link route,
// which carries the OLD identity's token in a second header.
export async function verifyPrivyAccessToken(token: string): Promise<AccessClaims | null> {
  return verifyWithPrivy(token);
}

async function verifyWithPrivy(token: string): Promise<AccessClaims | null> {
  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(token);
    return {
      provider: "privy",
      userId: claims.user_id,
      sessionId: claims.session_id,
      issuedAt: claims.issued_at,
      expiration: claims.expiration,
    };
  } catch {
    return null;
  }
}

async function verifyWithDecane(token: string): Promise<AccessClaims | null> {
  if (!decaneConfigured()) return null;
  try {
    const claims = await getDecaneClient().verifyAccessToken(token);
    return {
      provider: "decane",
      userId: claims.userId,
      // Decane has no session id. The token id is unique per issued token and
      // only keys the short-lived request-user cache, so it is close enough.
      sessionId: claims.tokenId ?? claims.subject,
      issuedAt: claims.issuedAt ?? 0,
      expiration: claims.expiresAt ?? 0,
    };
  } catch {
    return null;
  }
}

// Verifies an access token from either issuer. During the Privy to Decane
// migration window both are trusted: Decane first, since it is the app's
// identity, then Privy for the migration flow's legacy calls.
//
// Shared by the request path below and the cookie path Server Components use
// (lib/server/session.ts), so both accept exactly the same tokens — including
// Decane ones, which is why this is not Privy-only as it was on main.
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  return (await verifyWithDecane(token)) ?? verifyWithPrivy(token);
}

// Verifies the caller's access token. Returns null when the request carries no
// token or neither issuer verifies it.
export async function verifyRequest(req: NextRequest): Promise<AccessClaims | null> {
  const token = extractAccessToken(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

// The caller's proven identity: who they are and which embedded wallets the
// session owns. This is what money-moving routes key on; it deliberately
// carries no profile data.
export interface RequestIdentity {
  userId: string;
  evmAddress: string | null;
  solanaAddress: string | null;
}

const identityCache = new Map<string, { identity: RequestIdentity; expiresAt: number }>();
const identityLoads = new Map<string, Promise<RequestIdentity | null>>();

function cachedIdentity(key: string): RequestIdentity | null {
  const cached = identityCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    identityCache.delete(key);
    return null;
  }
  identityCache.delete(key);
  identityCache.set(key, cached);
  return cached.identity;
}

function cacheIdentity(key: string, identity: RequestIdentity): void {
  if (identityCache.size >= REQUEST_USER_CACHE_MAX_ENTRIES) {
    const oldest = identityCache.keys().next().value;
    if (oldest) identityCache.delete(oldest);
  }
  identityCache.set(key, { identity, expiresAt: Date.now() + REQUEST_USER_CACHE_TTL_MS });
}

function privyWalletAddress(user: User, chainType: "ethereum" | "solana"): string | null {
  // The embedded Privy wallet, never a linked external one: the client
  // identifies by the embedded address, and stamping an external one would
  // post actions under an identity the client never matches.
  const wallets = user.linked_accounts.filter(
    (account) =>
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === chainType &&
      "address" in account
  );
  const embedded = wallets.find(
    (account) => "wallet_client_type" in account && account.wallet_client_type === "privy"
  );
  const wallet = embedded ?? wallets[0];
  return wallet && "address" in wallet ? wallet.address : null;
}

// Resolves the verified caller's identity and wallet addresses, from either
// issuer: a Decane token resolves through Decane's address endpoint, a Privy
// token through the Privy user object. Cached per session for the same TTL as
// the user cache, since money routes call this on every request.
export async function getRequestIdentity(
  req: NextRequest,
  claims: AccessClaims | null = null
): Promise<RequestIdentity | null> {
  const token = extractAccessToken(req);
  if (!token) return null;

  const key = claims ? requestUserCacheKey(claims) : null;
  if (key) {
    const cached = cachedIdentity(key);
    if (cached) return cached;
    const pending = identityLoads.get(key);
    if (pending) return pending;
  }

  const load = async (): Promise<RequestIdentity | null> => {
    if (decaneConfigured()) {
      try {
        const decaneClaims = await getDecaneClient().safeVerifyAccessToken(token);
        if (decaneClaims) {
          const addresses = await getDecaneClient().getAddresses(token);
          return {
            userId: decaneClaims.userId,
            evmAddress: addresses.evm,
            solanaAddress: addresses.solana,
          };
        }
      } catch {
        // Address fetch failed; fall through to the Privy path, which will
        // return null for a Decane token and leave the caller unauthenticated
        // rather than half-identified.
      }
    }
    const user = await getRequestUser(req, claims);
    if (!user) return null;
    return {
      userId: user.id,
      evmAddress: privyWalletAddress(user, "ethereum"),
      solanaAddress: privyWalletAddress(user, "solana"),
    };
  };

  if (!key) return load();
  const request = load()
    .then((identity) => {
      if (identity) cacheIdentity(key, identity);
      return identity;
    })
    .finally(() => identityLoads.delete(key));
  identityLoads.set(key, request);
  return request;
}

// Resolves the full Privy user behind verified claims, cached per session.
//
// An identity token, when the client sent one, is only a shortcut: it is
// client-supplied, so it must name the same user the access token does.
// Otherwise a caller could pair their own session with someone else's identity
// token and the wallet gates in kash and perp would treat them as that wallet's
// owner. A mismatch is ignored and the verified user id is loaded instead.
//
// Privy sessions only; Decane callers resolve via getRequestIdentity.
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
    try {
      return await getPrivyClient().users()._get(claims.userId);
    } catch {
      return null;
    }
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
