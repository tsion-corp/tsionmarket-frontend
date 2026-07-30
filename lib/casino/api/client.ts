"use client";

// Transport for the casino gateway (draw, spectator betting, hub). Reads and
// writes go through our own same-origin proxy (app/api/casino) rather than the
// gateway directly, the same arrangement the vault uses: the proxy attaches the
// caller's session server-side so a browser never holds a service key.
//
// Chess has moved to its own service and transport, see chess-client.

import { unwrap } from "@/lib/casino/api/envelope";

export type { CasinoApiError } from "@/lib/casino/api/envelope";
export { isCasinoUnconfigured } from "@/lib/casino/api/envelope";

const BASE_PATH = "/api/casino";
const FALLBACK_MESSAGE = "The casino is unavailable right now.";

export async function casinoGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return unwrap<T>(await fetch(`${BASE_PATH}${path}${query}`), FALLBACK_MESSAGE);
}

export async function casinoPost<T>(path: string, body?: unknown): Promise<T> {
  // Actions like accept and resign carry no body. Sending a JSON content-type
  // with nothing in it is rejected by strict servers, so the header only goes
  // on when there is actually a body.
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
