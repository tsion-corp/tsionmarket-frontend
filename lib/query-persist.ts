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
  // The reuse-what-exists variant of the static address. It was documented as
  // persisted but never was: the match below is exact on the first key
  // element, and "deposit-static" does not cover "deposit-static-stable", so
  // the address list call was paid on every cold load of the deposit screen.
  "deposit-static-stable",
  "portfolio",
  "prices",
  // The Kash+ balance and its engine status. Cached like the wallet balance so
  // the card paints the last figure instantly on reload instead of a spinner;
  // the refresh on opening the card lands behind it.
  "kash",
  "buy-destinations",
  "rwa-assets",
  "rwa-categories",
  "fx-rates",
  "predictions",
  "prediction-combo-filters",
  "prediction-combo-events",
  "prediction-combo-event",
  // The memecoin reads that are still worth painting from disk: a token
  // detail, a search, the swap feed. The catalogue and the trending board are
  // excluded below.
  "meme",
]);

// Memecoin queries that stay in memory only. Both are now cached for a long
// time on purpose: the catalogue holds every row for the life of the tab
// (staleTime Infinity) and trending refetches once every ten minutes. Restoring
// either from localStorage on a reload would hand that long freshness window a
// snapshot from the last visit, so the reload would paint old coins and then
// not refetch. Dropping them from the snapshot is what makes a reload a real
// read. See useMemeCatalog and useTrendingBoard.
//
// Both of them do keep a copy in sessionStorage, which is a different mechanism
// and not a way around this. The trending board's copy is handed to its query
// as initialData, which is safe because the copy is discarded at five minutes
// and the query goes stale at ten, so a seeded board still refetches on its own.
// The catalogue's copy is never handed to its query at all, because that query
// never goes stale: it is rendered while the query holds nothing, and page 1 is
// still asked for on every page load. See
// features/trade/hooks/use-meme-catalog-session.
const UNPERSISTED_MEME_QUERIES = new Set(["catalog", "trending"]);

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
  if (!PERSISTED_PREFIXES.has(String(key[0]))) return false;
  if (String(key[0]) === "meme" && UNPERSISTED_MEME_QUERIES.has(String(key[1]))) return false;
  return true;
}
