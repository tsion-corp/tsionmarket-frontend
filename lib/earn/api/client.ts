"use client";

// Transport for the earn service (listings, sponsors, submissions). Everything
// goes through our own same-origin proxy at app/api/earn rather than the
// gateway directly: the proxy attaches the caller's session and resolves which
// sponsor they may act as, so a browser never holds a service key and never
// gets to name a sponsor.

import { unwrap } from "@/lib/api/envelope";

const BASE_PATH = "/api/earn";
const FALLBACK_MESSAGE = "Earn is unavailable right now.";

export async function earnGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const query = params ? buildQuery(params) : "";
  return unwrap<T>(await fetch(`${BASE_PATH}${path}${query}`), FALLBACK_MESSAGE);
}

export async function earnPost<T>(path: string, body?: unknown): Promise<T> {
  // Some actions carry no body. Sending a JSON content-type with nothing in it
  // is rejected by strict servers, so the header only goes on when there is
  // actually a body.
  return unwrap<T>(
    await fetch(`${BASE_PATH}${path}`, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    }),
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
