// Resolving which sponsor a caller is allowed to act as.
//
// The earn service does not verify tokens. It trusts the `x-user-id` and
// `x-sponsor-id` headers it is given, which makes our proxy the only thing
// standing between a browser and someone else's sponsor account. If we
// forwarded a sponsor id the browser supplied, any signed-in user could edit
// any company's listings and read its submissions. So the proxy asks the earn
// service which sponsor the caller actually owns, and forwards that.
//
// The logic lives here, free of Next and of fetch, so it can be tested without
// a network. The route supplies the fetcher.

export type SponsorFetcher = (userId: string) => Promise<string | null>;

// The lookup costs an extra round trip on every sponsor request. A short TTL
// collapses the burst a dashboard makes on load without holding a stale answer
// long enough to matter: a user who has just created their sponsor waits at
// most this long before the proxy sees it.
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  sponsorId: string | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

// Collapses concurrent lookups for the same user into one upstream call. A
// dashboard mount fires several sponsor requests at once and they would
// otherwise each trigger their own resolution.
const inFlight = new Map<string, Promise<string | null>>();

export async function resolveSponsorId(
  userId: string,
  fetchSponsor: SponsorFetcher,
  now: number = Date.now()
): Promise<string | null> {
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.sponsorId;

  const pending = inFlight.get(userId);
  if (pending) return pending;

  const lookup = fetchSponsor(userId)
    .then((sponsorId) => {
      cache.set(userId, { sponsorId, expires: Date.now() + CACHE_TTL_MS });
      return sponsorId;
    })
    .finally(() => {
      inFlight.delete(userId);
    });

  inFlight.set(userId, lookup);
  return lookup;
}

// Drops a cached answer. Called after the user creates a sponsor so the next
// request does not wait out the TTL before the dashboard works.
export function forgetSponsor(userId: string): void {
  cache.delete(userId);
}

// Test seam. Module-level state would otherwise leak between cases.
export function clearSponsorCache(): void {
  cache.clear();
  inFlight.clear();
}
