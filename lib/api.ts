"use client";

import { resolveAuthTokens } from "@/lib/privy-token";
import {
  circuitAllows,
  readRetryAt,
  recordCircuitFailure,
  recordCircuitSuccess,
  recordReadRateLimit,
} from "@/lib/api/circuit-store";
import { apiError } from "@/lib/api/envelope";
import { reportUpstreamFailure } from "@/lib/analytics/watchtower";

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
  opts: { requireAuth?: boolean; anonymous?: boolean } = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const retryAt = isRead ? readRetryAt(path) : null;
  if (retryAt) {
    throw apiError("TOO_MANY_REQUESTS", "Too many requests. Waiting before retrying.", 429, {
      retryAt,
    });
  }

  // `anonymous` sends no credentials at all, for reads that are the same for
  // everyone. It exists so a public read can still sit behind the breaker
  // below without becoming uncacheable: a request carrying an Authorization
  // header is private to one user, so a shared cache must not store it. That
  // is why these reads used to go straight to `fetch` and skip the breaker
  // entirely, which is the wrong trade — the breaker is what stops a failing
  // endpoint costing an invocation per poll.
  if (!opts.anonymous) {
    const { accessToken, idToken } = await resolveAuthTokens();
    if (opts.requireAuth && (!accessToken || !idToken)) {
      throw new Error("Auth not ready, retrying");
    }
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (idToken) headers.set("privy-id-token", idToken);
  }

  /**
   * The breakers sit at the ONE transport, not in each hook, one per
   * upstream service (see lib/api/circuit-store for why not one for all).
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
  if (isRead && !circuitAllows(path)) {
    throw new Error("Can't reach the server right now");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    // No status at all: DNS, TCP, CORS, offline. The clearest signal there is.
    recordCircuitFailure(path, undefined);
    reportUpstreamFailure(path, undefined, error);
    throw error;
  }
  if (response.ok) recordCircuitSuccess(path);
  else {
    if (response.status === 429) recordReadRateLimit(path, response.headers.get("retry-after"));
    recordCircuitFailure(path, response.status);
    // The reason error reporting sits HERE and not in each caller.
    //
    // Every failure in this app is handled: a hook catches it and the screen
    // shows "Couldn't load" rather than crashing. That is correct behaviour and
    // it is also why nothing was ever reported. Sentry's global handlers only
    // see what nobody caught, so an upstream returning 502 to every user in
    // production raised no alert at all.
    //
    // One transport means one place to notice. reportUpstreamFailure decides
    // what is worth sending (5xx and network failures, not a 401 on a cold
    // token) and throttles per endpoint, so a hard-polled broken route cannot
    // flood the project.
    reportUpstreamFailure(path, response.status, undefined, response.headers.get("x-request-id"));
  }
  return response;
}
