interface PredictionResponseCacheEntry {
  body: unknown;
  status: number;
  storedAt: number;
}

const responseCache = new Map<string, PredictionResponseCacheEntry>();
const MAX_ENTRIES = 200;

export interface PredictionCachePolicy {
  freshMs: number;
  staleMs: number;
}

export function predictionCachePolicy(path: string): PredictionCachePolicy {
  if (path === "sports/combo-filters" || path === "sports/filters" || path === "sports/teams") {
    return { freshMs: 5 * 60_000, staleMs: 24 * 60 * 60_000 };
  }
  if (/^sports\/(?:combo-)?events\/\d+$/.test(path)) {
    return { freshMs: 5_000, staleMs: 60_000 };
  }
  if (/^markets\/events\/\d+$/.test(path)) {
    return { freshMs: 15_000, staleMs: 5 * 60_000 };
  }
  if (path === "markets/events") {
    return { freshMs: 30_000, staleMs: 10 * 60_000 };
  }
  return { freshMs: 15_000, staleMs: 5 * 60_000 };
}

export function readPredictionResponseCache(
  key: string,
  maxAgeMs: number,
  now = Date.now()
): PredictionResponseCacheEntry | null {
  const entry = responseCache.get(key);
  if (!entry || now - entry.storedAt > maxAgeMs) return null;
  return entry;
}

export function writePredictionResponseCache(
  key: string,
  body: unknown,
  status: number,
  now = Date.now()
): void {
  if (responseCache.size >= MAX_ENTRIES && !responseCache.has(key)) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  // Refresh insertion order so capacity eviction removes the least recently
  // written key rather than a hot key that happened to be inserted early.
  responseCache.delete(key);
  responseCache.set(key, { body, status, storedAt: now });
}

export function clearPredictionResponseCache(): void {
  responseCache.clear();
}
