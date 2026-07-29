"use client";

import { resolveAuthTokens } from "@/lib/privy-token";

// Fetch wrapper for our API routes. Attaches the Privy access token so the
// server can verify the caller, plus the identity token when available so
// routes can resolve the full user without an extra Privy API call.
//
// Both tokens come from resolveAuthTokens, which caches the identity token so a
// burst of authed requests on mount makes one Privy /users/me call instead of
// one per request (see lib/privy-token for why that matters).
//
// On a cold first load Privy can report "authenticated" a moment before the
// access token is warm, so the access token is briefly null. Callers of
// auth-gated routes pass `requireAuth` so that, instead of firing a token-less
// request that 401s, we throw a retryable error and let the caller's query
// retry once the token lands.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: { requireAuth?: boolean } = {}
): Promise<Response> {
  const { accessToken, idToken } = await resolveAuthTokens();
  if (opts.requireAuth && !accessToken) {
    throw new Error("Auth not ready, retrying");
  }
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idToken) headers.set("privy-id-token", idToken);
  return fetch(path, { ...init, headers });
}
