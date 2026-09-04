import "server-only";

/**
 * Short-lived snapshot cache for upstream reads, shared by every server module
 * that pays per call.
 *
 * Three jobs, and the second is the one that matters most under load:
 *
 *  1. Serve a repeat read from the last snapshot inside its TTL.
 *  2. Collapse concurrent misses onto ONE upstream call. Twenty thousand users
 *     polling on their own timers put many simultaneous requests on the same
 *     wallet, from a second tab, a second device, or several components. Each
 *     firing its own upstream call is the burst that walks into a rate limit.
 *  3. Serve a slightly stale snapshot when the upstream fails, so a throttled
 *     provider degrades instead of erroring every caller for the outage.
 *
 * Lifted out of alchemy.ts, where it was private, so activity could stop being
 * the one expensive path with no cache in front of it.
 */

/**
 * How long past expiry a snapshot may still stand in when the upstream call
 * fails. Slightly stale data beats an error flash, but a snapshot old enough
 * to be from a different world must not.
 */
const STALE_SERVE_MS = 60_000;

const responseCache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  cacheKey: string,
  load: () => Promise<T>,
  ttlMs: number,
  // Set when the caller has just changed the underlying state and needs to
  // observe its own effect. Reading a cached snapshot there shows the previous
  // state and then holds it until the next poll.
  skipCache = false
): Promise<T> {
  const hit = responseCache.get(cacheKey);
  const inflightKey = skipCache ? `fresh:${cacheKey}` : cacheKey;
  if (!skipCache && hit && hit.expires > Date.now()) return hit.value as T;

  const pending = inflight.get(inflightKey);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    try {
      const value = await load();
      responseCache.set(cacheKey, { expires: Date.now() + ttlMs, value });
      return value;
    } catch (error) {
      if (hit && hit.expires > Date.now() - STALE_SERVE_MS) return hit.value as T;
      throw error;
    } finally {
      inflight.delete(inflightKey);
    }
  })();
  inflight.set(inflightKey, run);
  return run;
}

/** Test seam: the module keeps process-wide state between cases. */
export function resetResponseCache(): void {
  responseCache.clear();
  inflight.clear();
}
