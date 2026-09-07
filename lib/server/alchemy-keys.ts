import "server-only";

/**
 * The Alchemy key pool and the fetch that rotates through it.
 *
 * One key is a single point of failure: when it is throttled, revoked or over
 * its app's monthly capacity, every surface that reads it goes down at once,
 * including portfolio discovery, prices, activity, Solana and gas
 * sponsorship. ALCHEMY_API_KEY is therefore an ordered, comma-separated list;
 * each key is paired by index with a gas policy in ALCHEMY_GAS_POLICY_ID
 * (ADR-2026-09-07-alchemy-key-pool). Calls walk the list until one key can
 * serve them.
 *
 * Read at call time rather than module load. A module-level const captures
 * whatever was set when the bundle was first imported, which makes the pool
 * impossible to stub in a test and impossible to change without a redeploy.
 */

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Configured keys, in order. ALCHEMY_API_KEY is a comma-separated list; the
 * deprecated ALCHEMY_API_KEY_FALLBACK is appended after it so a half-migrated
 * environment keeps working. Blanks and duplicates are dropped.
 */
export function alchemyKeys(): string[] {
  return alchemyPairs().map((pair) => pair.key);
}

/**
 * One entry per configured key, paired with the gas policy at the same index
 * of ALCHEMY_GAS_POLICY_ID (and ALCHEMY_POLYGON_GAS_POLICY_ID). A Gas Manager
 * policy belongs to the Alchemy app that created it, so a key is only ever
 * sent with the policy at its own index; a key with no policy at its index
 * reads and prices but never sponsors.
 */
export interface AlchemyPair {
  index: number;
  key: string;
  policyId?: string;
  polygonPolicyId?: string;
}

export function alchemyPairs(): AlchemyPair[] {
  const keys = list(process.env.ALCHEMY_API_KEY);
  // Blanks keep their slot in the policy lists, so an index without a policy
  // does not shift the ones after it onto the wrong key.
  const slots = (raw: string | undefined) => (raw ?? "").split(",").map((s) => s.trim());
  const policies = slots(process.env.ALCHEMY_GAS_POLICY_ID);
  const polygon = slots(process.env.ALCHEMY_POLYGON_GAS_POLICY_ID);
  const pairs: AlchemyPair[] = keys.map((key, index) => ({
    index,
    key,
    policyId: policies[index] || undefined,
    polygonPolicyId: polygon[index] || undefined,
  }));
  for (const key of list(process.env.ALCHEMY_API_KEY_FALLBACK)) {
    pairs.push({ index: pairs.length, key });
  }
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    if (seen.has(pair.key)) return false;
    seen.add(pair.key);
    return true;
  });
}

// A key that has just answered capacity or auth will answer the same way to
// the next request, so it is skipped for a cooldown rather than paid for
// again. Per process: serverless instances each learn separately, at the
// cost of one failed call per instance per cooldown.
const blockedUntil = new Map<string, number>();
export const MONTHLY_CAPACITY_COOLDOWN_MS = 10 * 60_000;
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

export function markAlchemyKeyBlocked(key: string, ms: number): void {
  blockedUntil.set(key, Date.now() + ms);
}

export function isAlchemyKeyBlocked(key: string): boolean {
  const until = blockedUntil.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  blockedUntil.delete(key);
  return false;
}

export function resetAlchemyKeyBlocks(): void {
  blockedUntil.clear();
}

/** The keys to try, in order: the ones not on cooldown first, then the rest. */
export function alchemyKeysInOrder(): string[] {
  const keys = alchemyKeys();
  return [...keys.filter((k) => !isAlchemyKeyBlocked(k)), ...keys.filter(isAlchemyKeyBlocked)];
}

/** True when at least one key is configured. Routes use it to answer 503. */
export function hasAlchemyKey(): boolean {
  return alchemyKeys().length > 0;
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

export const MONTHLY_CAPACITY_EXHAUSTED = /monthly capacity limit exceeded/i;

// How long to skip a key that answered with a quota problem. An app over its
// monthly capacity stays that way until billing rolls or the plan changes; a
// plain rate limit clears in seconds. The body is read from a clone so the
// caller can still read the response.
async function cooldownFor(res: Response): Promise<number> {
  if (res.status !== 429) return RATE_LIMIT_COOLDOWN_MS;
  const text = await res
    .clone()
    .text()
    .catch(() => "");
  return MONTHLY_CAPACITY_EXHAUSTED.test(text)
    ? MONTHLY_CAPACITY_COOLDOWN_MS
    : RATE_LIMIT_COOLDOWN_MS;
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
      // so stop retrying this one and let the next key try. It is remembered
      // so the next request starts with a key that can answer.
      if (res.status < 500) {
        markAlchemyKeyBlocked(key, await cooldownFor(res));
        break;
      }
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
  const { res, error } = await rotate(alchemyKeysInOrder(), buildUrl, init);
  if (res?.ok) return res;
  throw error ?? new Error("Alchemy request failed");
}

/**
 * Fetch through the key pool, handing back the last response even when it
 * failed.
 *
 * For Alchemy-backed JSON-RPC proxies such as Solana, which forward the upstream
 * status verbatim. If a throttled upstream became a thrown error here, a 429 the
 * client knows how to back off from would reach it as an opaque 502 instead.
 * Still throws when every attempt failed at the network level, since then there
 * is no status to forward.
 */
export async function alchemyProxyFetch(
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<Response> {
  const { res, error } = await rotate(alchemyKeysInOrder(), buildUrl, init);
  if (res) return res;
  throw error ?? new Error("Alchemy request failed");
}
