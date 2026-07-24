// Query-key prefixes whose data is safe to persist to localStorage. These are
// long-lived catalogs (Dextopus chains/tokens, minted static addresses, the RWA
// registry, FX rates) that rarely change, so persisting them makes the data
// render instantly on the next visit instead of refetching. Volatile queries
// (portfolio, prices, deposit-status polls, token logos) are intentionally
// excluded so persisted state never goes stale in a harmful way.
export const PERSISTED_PREFIXES = new Set([
  "deposit-chains",
  "deposit-tokens",
  "deposit-static",
  "rwa-assets",
  "rwa-categories",
  "fx-rates",
  "predictions",
]);

export const RQ_PERSIST_KEY = "wsws.rq-cache.v1";
export const RQ_PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
// Bump to invalidate every persisted cache after a shape change.
export const RQ_PERSIST_BUSTER = "wsws-2026-07";

// Long gcTime for persisted queries so they are not evicted from memory before
// the throttled write reaches storage, and so a restore has something to hydrate.
export const PERSISTED_GC_TIME = RQ_PERSIST_MAX_AGE;

export function isPersistedKey(key: readonly unknown[]): boolean {
  return PERSISTED_PREFIXES.has(String(key[0]));
}
