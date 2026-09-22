import "server-only";

// The free Demo key allows 30 calls/min. Keyless requests fall to the legacy
// public tier, which throttles hard enough that charts intermittently fail.
const BASE = "https://api.coingecko.com/api/v3";

export function coingeckoUrl(path: string): string {
  return `${BASE}${path}`;
}

// A header, not a query parameter: sending both is an error, and a key in the
// URL ends up in logs and cache keys.
export function coingeckoHeaders(): HeadersInit | undefined {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : undefined;
}
