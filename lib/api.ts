"use client";

import { getAccessToken, getIdentityToken } from "@privy-io/react-auth";

// Fetch wrapper for our API routes. Attaches the Privy access token so the
// server can verify the caller, plus the identity token when available so
// routes can resolve the full user without an extra Privy API call.
//
// On a cold first load Privy can report "authenticated" a moment before the
// access token is warm, so `getAccessToken()` briefly returns null. Callers of
// auth-gated routes pass `requireAuth` so that, instead of firing a token-less
// request that 401s, we throw a retryable error and let the caller's query
// retry once the token lands.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: { requireAuth?: boolean } = {}
): Promise<Response> {
  const [accessToken, idToken] = await Promise.all([getAccessToken(), getIdentityToken()]);
  if (opts.requireAuth && !accessToken) {
    throw new Error("Auth not ready, retrying");
  }
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idToken) headers.set("privy-id-token", idToken);
  return fetch(path, { ...init, headers });
}
