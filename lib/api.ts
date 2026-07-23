"use client";

import { getAccessToken, getIdentityToken } from "@privy-io/react-auth";

// Fetch wrapper for our API routes. Attaches the Privy access token so the
// server can verify the caller, plus the identity token when available so
// routes can resolve the full user without an extra Privy API call.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const [accessToken, idToken] = await Promise.all([getAccessToken(), getIdentityToken()]);
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idToken) headers.set("privy-id-token", idToken);
  return fetch(path, { ...init, headers });
}
