// Query-key prefixes whose data is safe to persist to localStorage, so a
// reload paints the last-known value immediately instead of a blank/zero
// state. This is safe even for volatile data like portfolio and prices
// because each query keeps its own short staleTime — a rehydrated value is
// shown at once, but React Query's normal refetch-on-mount immediately fires
// a background refresh behind it, so the stale window is bounded by however
// long that refetch takes (typically well under a second), not by how old
// the persisted snapshot was. Still excluded: deposit-status polls and token
// logos, which have no meaningful "last known" value worth showing early.
export const PERSISTED_PREFIXES = new Set([
  "deposit-chains",
  "deposit-tokens",
  "deposit-master-eligibility",
  "deposit-static",
  "portfolio",
  "prices",
  "buy-destinations",
  "rwa-assets",
  "rwa-categories",
  "fx-rates",
  "predictions",
  "prediction-combo-filters",
  "prediction-combo-events",
  "prediction-combo-event",
  // The memecoin lists: the trade service's discovery provider goes down in
  // bursts, taking every listing route with it. A persisted snapshot keeps
  // real coins on screen through one of those bursts instead of an
  // "unavailable" panel, and the refetch behind it corrects prices at once.
  "meme",
]);

export const RQ_PERSIST_KEY = "wsws.rq-cache.v1";
export const RQ_PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
// Bump to invalidate every persisted cache after a shape change. Bumped again
// here: deposit-tokens' supportsStaticAddress correction and the deposit
// flow's settle-to-Base change both altered what a persisted entry means, so
// anything cached under the old shape has to be dropped, not reused. Bumped
// again for the EVM-native-ETH eligibility fix in depositOriginAsset — every
// browser that loaded the deposit screen before this fix has ETH cached under
// deposit-tokens with supportsStaticAddress: false, which the code fix alone
// does not correct (the persisted query result is the computed DepositToken[],
// not the raw API response, so it never re-runs the corrected logic on its own).
export const RQ_PERSIST_BUSTER = "wsws-2026-08-16";

// Long gcTime for persisted queries so they are not evicted from memory before
// the throttled write reaches storage, and so a restore has something to hydrate.
export const PERSISTED_GC_TIME = RQ_PERSIST_MAX_AGE;

export function isPersistedKey(key: readonly unknown[]): boolean {
  return PERSISTED_PREFIXES.has(String(key[0]));
}
