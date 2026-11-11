import "server-only";

/**
 * The wallet service (crypto-wallet) behind the upgrade. The browser never talks
 * to it directly: these routes add the Clerk session, refuse paths the client has
 * no business calling, and refuse a development build pointed at production.
 */

export function walletServiceBase(): string | null {
  const value = process.env.CRYPTO_WALLET_API_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The upstream path for a client request, or null when it is not one the client
 * may make. Anything else (the internal address lookup, health, unknown
 * routes) is refused here rather than trusted to the service.
 */
export function walletPath(method: string, segments: ReadonlyArray<string>): string | null {
  if (!segments.every((part) => SEGMENT.test(part))) return null;
  const path = segments.join("/");
  const m = method.toUpperCase();
  if (path === "me" && m === "GET") return "/wallets/me";
  if (path === "" && m === "POST") return "/wallets";
  if (path === "me/challenges" && m === "POST") return "/wallets/me/challenges";
  if (path === "me/package" && m === "PUT") return "/wallets/me/package";
  if (path === "me/devices" && m === "POST") return "/wallets/me/devices";
  if (/^me\/devices\/[A-Za-z0-9_-]{1,128}$/.test(path) && m === "DELETE") {
    return `/wallets/${path}`;
  }
  return null;
}

/** A package is at most 256 KiB; the request around it adds little. */
export const MAX_WALLET_BODY_BYTES = 320 * 1024;
