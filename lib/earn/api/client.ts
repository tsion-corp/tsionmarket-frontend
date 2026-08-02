"use client";

// Transport for the earn service (listings, companies, submissions). Everything
// goes through our own same-origin proxy at app/api/earn rather than the gateway
// directly, because the gateway sends no CORS headers.
//
// Earn verifies the caller's Privy access token itself and resolves it to its
// own user, roles and company. So authenticated calls go through apiFetch,
// which attaches that token; the proxy passes it upstream unchanged. Public
// reads use a plain fetch and stay cacheable.

import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";

const BASE_PATH = "/api/earn";
const FALLBACK_MESSAGE = "Earn is unavailable right now.";

// The browse feed and the availability checks, which a signed-out visitor reads.
export async function earnGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const query = params ? buildQuery(params) : "";
  return unwrap<T>(await fetch(`${BASE_PATH}${path}${query}`), FALLBACK_MESSAGE);
}

// Anything scoped to the caller: their company, their submissions, the sponsor
// dashboard. `requireAuth` makes a cold token a retryable error rather than a
// 401 the user has to make sense of.
export async function earnAuthedGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const query = params ? buildQuery(params) : "";
  return unwrap<T>(
    await apiFetch(`${BASE_PATH}${path}${query}`, {}, { requireAuth: true }),
    FALLBACK_MESSAGE
  );
}

export async function earnPost<T>(path: string, body?: unknown): Promise<T> {
  // Some actions carry no body. Sending a JSON content-type with nothing in it
  // is rejected by strict servers, so the header only goes on when there is
  // actually a body.
  return unwrap<T>(
    await apiFetch(
      `${BASE_PATH}${path}`,
      {
        method: "POST",
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      },
      { requireAuth: true }
    ),
    FALLBACK_MESSAGE
  );
}

// Drops undefined entries so an unset filter is absent from the URL rather
// than sent as the string "undefined".
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
