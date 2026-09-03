import "server-only";

/**
 * The Alchemy key pool and the fetch that rotates through it.
 *
 * One key is a single point of failure: when it is throttled or revoked, every
 * surface that reads it goes down at once, which is the whole portfolio, the
 * prices, the activity feed and the RPC proxies. A second key configured as
 * ALCHEMY_API_KEY_FALLBACK is tried when the first one cannot serve the call.
 *
 * Read at call time rather than module load. A module-level const captures
 * whatever was set when the bundle was first imported, which makes the pool
 * impossible to stub in a test and impossible to change without a redeploy.
 */

/** Configured keys, primary first. Blanks and duplicates are dropped. */
export function alchemyKeys(): string[] {
  const configured = [process.env.ALCHEMY_API_KEY, process.env.ALCHEMY_API_KEY_FALLBACK];
  return configured
    .map((key) => key?.trim())
    .filter((key, index, all): key is string => Boolean(key) && all.indexOf(key) === index);
}

/** True when at least one key is configured. Routes use it to answer 503. */
export function hasAlchemyKey(): boolean {
  return alchemyKeys().length > 0;
}

/** Dedicated standard JSON-RPC keys, falling back to the legacy pool. */
export function alchemyRpcKeys(): string[] {
  const dedicated = [process.env.ALCHEMY_RPC_API_KEY, process.env.ALCHEMY_RPC_API_KEY_FALLBACK]
    .map((key) => key?.trim())
    .filter((key, index, all): key is string => Boolean(key) && all.indexOf(key) === index);
  return dedicated.length > 0 ? dedicated : alchemyKeys();
}

export function hasAlchemyRpcKey(): boolean {
  return alchemyRpcKeys().length > 0;
}

/**
 * One URL per configured key, primary first.
 *
 * For the callers that already hold a list of upstreams and walk it until one
 * answers, the Solana RPC path being the example. They get the pool by holding
 * more entries rather than by changing how they retry.
 */
export function alchemyUrls(build: (key: string) => string): string[] {
  return alchemyKeys().map(build);
}

export function alchemyError(status: number): Error {
  return new Error(`Alchemy request failed: ${status}`);
}

/**
 * Whether a failed response is worth asking a DIFFERENT key about.
 *
 * 429 is the reason the pool exists: the first key is rate limited and the
 * second one has its own budget. 401 and 403 mean this key is rejected or out
 * of quota, which the next one may not be. Anything else in the 4xx range is
 * the request itself being wrong, and repeating it against the second key only
 * spends quota to be told the same thing.
 */
function worthAnotherKey(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

/**
 * Walks the key pool, returning whichever response ended the walk.
 *
 * Each key gets one retry for a transient fault, a network error or a 5xx,
 * before the next key is tried. A 4xx that is not a quota problem stops the
 * walk immediately, since no key will answer it differently.
 */
async function rotate(
  keys: string[],
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<{ res?: Response; error?: unknown }> {
  if (keys.length === 0) return { error: new Error("No Alchemy API key configured") };

  let last: { res?: Response; error?: unknown } = {};
  for (const key of keys) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        // 12s, not 7s: a cold serverless start plus a cold Alchemy connection
        // on the first request can exceed 7s and abort, showing "could not
        // load" on first paint even though a warm retry succeeds.
        res = await fetch(buildUrl(key), {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(12_000),
        });
      } catch (error) {
        // Network fault or timeout. Retry this key once, then move on.
        last = { error };
        continue;
      }

      if (res.ok) return { res };
      last = { res, error: alchemyError(res.status) };
      if (!worthAnotherKey(res.status)) return last;
      // A quota answer will not change on a second attempt with the same key,
      // so stop retrying this one and let the next key try.
      if (res.status < 500) break;
    }
  }
  return last;
}

/**
 * Fetch through the key pool, throwing on any failure.
 *
 * For callers that read a payload and treat a returned Response as one they
 * can parse.
 */
export async function alchemyFetch(
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<Response> {
  const { res, error } = await rotate(alchemyKeys(), buildUrl, init);
  if (res?.ok) return res;
  throw error ?? new Error("Alchemy request failed");
}

/**
 * Fetch through the key pool, handing back the last response even when it
 * failed.
 *
 * For the JSON-RPC proxies, which forward the upstream status verbatim. If a
 * throttled upstream became a thrown error here, a 429 the client knows how to
 * back off from would reach it as an opaque 502 instead. Still throws when
 * every attempt failed at the network level, since then there is no status to
 * forward.
 */
export async function alchemyProxyFetch(
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<Response> {
  const { res, error } = await rotate(alchemyKeys(), buildUrl, init);
  if (res) return res;
  throw error ?? new Error("Alchemy request failed");
}

/** Standard node-RPC fallback isolated from Portfolio/Prices API quotas. */
export async function alchemyRpcProxyFetch(
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<Response> {
  const { res, error } = await rotate(alchemyRpcKeys(), buildUrl, init);
  if (res) return res;
  throw error ?? new Error("Alchemy RPC request failed");
}
