"use client";

import { resolveAuthTokens } from "@/lib/privy-token";
import { circuitAllows, recordCircuitFailure, recordCircuitSuccess } from "@/lib/api/circuit-store";

// Fetch wrapper for our API routes. Attaches the Privy access token so the
// server can verify the caller, plus the identity token when available so
// routes can resolve the full user without an extra Privy API call.
//
// Both tokens come from resolveAuthTokens, which caches the identity token so a
// burst of authed requests on mount makes one Privy /users/me call instead of
// one per request (see lib/privy-token for why that matters).
//
// On a cold first load Privy can report "authenticated" a moment before the
// required tokens are warm, so either token can briefly be null. Callers of
// auth-gated routes pass `requireAuth` so that, instead of firing an incomplete
// request that 401s, we throw a retryable error and let the caller's query retry.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: { requireAuth?: boolean } = {}
): Promise<Response> {
  const { accessToken, idToken } = await resolveAuthTokens();
  if (opts.requireAuth && (!accessToken || !idToken)) {
    throw new Error("Auth not ready, retrying");
  }
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idToken) headers.set("privy-id-token", idToken);

  /**
   * The breaker sits at the ONE transport, not in each hook.
   *
   * This app polls harder than anything else we run — match state every
   * second, tickets every second, several of them deliberately continuing in
   * a hidden tab — and each of those requests is a serverless invocation. When
   * the gateway is down, none of that traffic can accomplish anything, so it
   * does not leave the tab at all: no network, no invocation, no cost.
   *
   * READS only. A write is the player doing something deliberate — a move, a
   * bet, a transfer — and refusing it in-process would look like it happened
   * when it did not. Those go out and fail honestly, and their failure still
   * informs the breaker.
   */
  const method = (init.method ?? "GET").toUpperCase();
  if ((method === "GET" || method === "HEAD") && !circuitAllows()) {
    throw new Error("Can't reach the server right now");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    // No status at all: DNS, TCP, CORS, offline. The clearest signal there is.
    recordCircuitFailure(undefined);
    throw error;
  }
  if (response.ok) recordCircuitSuccess();
  else recordCircuitFailure(response.status);
  return response;
}
