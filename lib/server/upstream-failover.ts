import "server-only";

const RETRYABLE_READ_STATUSES = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
const PREFERRED_READ_TTL_MS = 15_000;
const READY_TTL_MS = 15_000;

type CachedUpstream = {
  base: string;
  expiresAt: number;
};

const preferredReads = new Map<string, CachedUpstream>();
const readyUpstreams = new Map<string, CachedUpstream>();

function candidateKey(candidates: readonly string[]): string {
  return candidates.join("\n");
}

function upstreamUrl(base: string, path: string): string {
  return `${base}/${path.replace(/^\/+/, "")}`;
}

function orderedReadCandidates(candidates: readonly string[]): string[] {
  const cached = preferredReads.get(candidateKey(candidates));
  if (!cached || cached.expiresAt <= Date.now() || !candidates.includes(cached.base)) {
    return [...candidates];
  }
  return [cached.base, ...candidates.filter((candidate) => candidate !== cached.base)];
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is being abandoned so the next configured upstream can run.
  }
}

export function upstreamCandidates(...values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => (value ?? "").split(","))
        .map((value) => value.trim().replace(/\/+$/u, ""))
        .filter(Boolean)
    ),
  ];
}

export async function fetchUpstreamRead(
  candidates: readonly string[],
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  if (candidates.length === 0) throw new Error("No upstream is configured.");

  const key = candidateKey(candidates);
  const ordered = orderedReadCandidates(candidates);
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (const [index, base] of ordered.entries()) {
    try {
      const response = await fetch(upstreamUrl(base, path), {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const isLast = index === ordered.length - 1;
      if (!RETRYABLE_READ_STATUSES.has(response.status) || isLast) {
        if (lastResponse) await discard(lastResponse);
        if (response.ok) {
          preferredReads.set(key, { base, expiresAt: Date.now() + PREFERRED_READ_TTL_MS });
        }
        return response;
      }
      if (lastResponse) await discard(lastResponse);
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("Every upstream request failed.");
}

async function readyUpstream(candidates: readonly string[], timeoutMs: number): Promise<string> {
  const key = candidateKey(candidates);
  const cached = readyUpstreams.get(key);
  if (cached && cached.expiresAt > Date.now() && candidates.includes(cached.base)) {
    return cached.base;
  }

  const controllers = candidates.map(() => new AbortController());
  const checks = candidates.map(async (base, index) => {
    try {
      const response = await fetch(upstreamUrl(base, "ready"), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.any([controllers[index].signal, AbortSignal.timeout(timeoutMs)]),
      });
      const isReady = response.ok;
      await discard(response);
      return isReady;
    } catch {
      return false;
    }
  });

  try {
    // A write only needs one healthy destination. Waiting for every fallback
    // made a dead backup add the full readiness timeout to an otherwise healthy
    // primary, which was especially visible on real-time chess moves.
    for (const [index, check] of checks.entries()) {
      if (await check) {
        const base = candidates[index];
        readyUpstreams.set(key, { base, expiresAt: Date.now() + READY_TTL_MS });
        return base;
      }
    }
    throw new Error("No configured upstream is ready.");
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}

export async function fetchUpstreamWrite(
  candidates: readonly string[],
  path: string,
  init: RequestInit,
  timeoutMs: number,
  readinessTimeoutMs = 3_000
): Promise<Response> {
  if (candidates.length === 0) throw new Error("No upstream is configured.");

  // Probe before the mutation, but never retry it after submission: a timeout
  // cannot prove that the first service did not commit the operation.
  const base = await readyUpstream(candidates, readinessTimeoutMs);
  try {
    const response = await fetch(upstreamUrl(base, path), {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (RETRYABLE_READ_STATUSES.has(response.status)) {
      readyUpstreams.delete(candidateKey(candidates));
    }
    return response;
  } catch (error) {
    readyUpstreams.delete(candidateKey(candidates));
    throw error;
  }
}

export function clearUpstreamFailoverCache(): void {
  preferredReads.clear();
  readyUpstreams.clear();
}
