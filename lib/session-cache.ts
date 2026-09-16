// A small cache over sessionStorage for data worth keeping while the tab is
// open and discarding when it closes. Framework free: callers decide what to
// store and validate what they read back. Entries are versioned, so a shape
// change is a version bump rather than a crash on stale data, and bounded, so
// one namespace cannot fill the origin's quota.

export interface SessionCacheEntry<T> {
  data: T;
  savedAt: number;
}

export interface SessionCache {
  // Null for a missing entry. An expired, wrong-version or unreadable entry is
  // also null, and is removed.
  read<T>(key: string, maxAgeMs: number): SessionCacheEntry<T> | null;
  // Keeps at most maxEntries in the namespace, evicting the oldest first. A
  // write the storage refuses is reported through warn, never thrown.
  write<T>(key: string, data: T): void;
  remove(key: string): void;
}

export interface SessionCacheOptions {
  // Keys are stored as `${namespace}.${key}`.
  namespace: string;
  version: number;
  // Counts only this namespace's keys.
  maxEntries: number;
  // Defaults to window.sessionStorage when it can be reached, else no storage.
  storage?: Storage | null;
  now?: () => number;
  warn?: (message: string, error: unknown) => void;
}

interface StoredEntry {
  v: number;
  savedAt: number;
  data: unknown;
}

// Reaching window.sessionStorage throws a SecurityError in a sandboxed iframe
// and with storage blocked for the site. That is a capability check, not a
// failure to hide: without storage the cache simply holds nothing, and the
// data is fetched as it would be with no cache. A write refused later, by a
// full quota for instance, is still reported.
function reachableSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// Chrome and Safari name it QuotaExceededError; Firefox has used its own name.
function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function parseEntry(raw: string): StoredEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // A value that is not JSON is corrupt, and the caller removes it. Only a
    // parse failure means that; anything else is a real fault.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  if (!("v" in parsed) || !("savedAt" in parsed) || !("data" in parsed)) return null;
  const { v, savedAt, data } = parsed;
  if (typeof v !== "number" || typeof savedAt !== "number" || !Number.isFinite(savedAt)) {
    return null;
  }
  return { v, savedAt, data };
}

const NO_STORAGE: SessionCache = {
  read: () => null,
  write: () => undefined,
  remove: () => undefined,
};

export function createSessionCache(options: SessionCacheOptions): SessionCache {
  const storage = options.storage === undefined ? reachableSessionStorage() : options.storage;
  if (storage === null) return NO_STORAGE;

  const { namespace, version, maxEntries } = options;
  const now = options.now ?? Date.now;
  const warn = options.warn ?? ((message: string, error: unknown) => console.warn(message, error));
  const prefix = `${namespace}.`;
  const storageKey = (key: string) => `${prefix}${key}`;

  // This namespace's stored keys other than `except`, oldest first. An entry
  // that cannot be read sorts before every readable one, so it goes first.
  const oldestFirst = (except: string): string[] => {
    const entries: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null || !key.startsWith(prefix) || key === except) continue;
      const raw = storage.getItem(key);
      const savedAt = (raw === null ? null : parseEntry(raw))?.savedAt ?? -Infinity;
      entries.push({ key, savedAt });
    }
    entries.sort((a, b) => (a.savedAt === b.savedAt ? 0 : a.savedAt < b.savedAt ? -1 : 1));
    return entries.map((entry) => entry.key);
  };

  return {
    read<T>(key: string, maxAgeMs: number): SessionCacheEntry<T> | null {
      const fullKey = storageKey(key);
      const raw = storage.getItem(fullKey);
      if (raw === null) return null;
      const entry = parseEntry(raw);
      const expired = entry !== null && maxAgeMs !== Infinity && now() - entry.savedAt > maxAgeMs;
      if (entry === null || entry.v !== version || expired) {
        storage.removeItem(fullKey);
        return null;
      }
      // The entry was written by this cache under the same version, so it is
      // trusted as T. Data restored into UI state is still checked by the
      // caller (isScreenerFilters, for one).
      return { data: entry.data as T, savedAt: entry.savedAt };
    },

    write<T>(key: string, data: T): void {
      const fullKey = storageKey(key);
      const entry: StoredEntry = { v: version, savedAt: now(), data };
      const payload = JSON.stringify(entry);

      const others = oldestFirst(fullKey);
      const excess = others.length - maxEntries + 1;
      for (const stale of others.slice(0, Math.max(0, excess))) storage.removeItem(stale);

      try {
        storage.setItem(fullKey, payload);
        return;
      } catch (error) {
        const [oldest] = oldestFirst(fullKey);
        if (!isQuotaError(error) || oldest === undefined) {
          warn(`Could not save ${fullKey} to sessionStorage`, error);
          return;
        }
        storage.removeItem(oldest);
      }

      // One retry after freeing the oldest entry. If that is not enough the
      // data stays in memory only, and the failure is reported.
      try {
        storage.setItem(fullKey, payload);
      } catch (error) {
        warn(`Could not save ${fullKey} to sessionStorage after evicting the oldest entry`, error);
      }
    },

    remove(key: string): void {
      storage.removeItem(storageKey(key));
    },
  };
}
