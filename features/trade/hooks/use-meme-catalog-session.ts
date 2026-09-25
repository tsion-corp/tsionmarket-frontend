"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { MemeToken } from "@/lib/meme/api";
import type { Paged } from "@/lib/meme/catalog";
import { createSessionCache, type SessionCache } from "@/lib/session-cache";

// A walked list's first page, kept in sessionStorage so a tab that opens while
// the trade service is refusing shows the last good rows instead of an empty
// panel. The Trending strip has done this since the screener shipped; the
// catalogue never did, so one failed first page left the desk reading
// "Memecoin markets are unavailable" while the strip beside it, holding its own
// copy, looked perfectly healthy.
//
// Two surfaces walk a list this way: the unfiltered catalogue
// (use-meme-tokens) and the screener's filtered list (use-meme-screener). They
// share the mechanism below and nothing else; each keeps its own session cache,
// so each keeps its own namespace, its own entry budget and its own test hook.
//
// Only the first page is kept. It is what fills the visible rows, and the
// catalogue is 289 pages of 500, so keeping the walk would put megabytes of
// token data into an origin quota of about five.
//
// These rows are a fallback for rendering, never `initialData`, and that is the
// one place this departs from the same fix on main. Both queries are
// `staleTime: Infinity` with no refetch on mount, on focus or on reconnect, so
// a query handed `initialData` would count itself fresh for the life of the tab
// and never read the service at all: a reload would paint a five minute old
// list and stop there. Main could hand it over as `initialData` because its
// catalogue went stale after fifteen seconds and refetched underneath the seed;
// ours cannot. So the queries are left exactly as they were and still ask for
// page 1 on every page load, and these rows stand in only while a query holds
// none of its own. The localStorage snapshot excludes both lists for the same
// reason, and this does not put them back: see lib/query-persist.

const NAMESPACE = "wsws.meme-catalog";
const VERSION = 1;
// One entry per list walked in a tab: the whole catalogue, and a chain or two.
const MAX_ENTRIES = 6;

/** How old a stored first page may be and still be painted. */
export const CATALOG_SESSION_MAX_AGE_MS = 5 * 60_000;

let cache: SessionCache | null = null;
let storageOverride: Storage | null | undefined;

// Built on first use, not at module load: the constructor probes
// window.sessionStorage, which does not exist while rendering on the server.
function catalogCache(): SessionCache {
  cache ??= createSessionCache({
    namespace: NAMESPACE,
    version: VERSION,
    maxEntries: MAX_ENTRIES,
    storage: storageOverride,
  });
  return cache;
}

/** The seed and write-back pair for one session cache. */
export interface CatalogPageSession {
  /**
   * The stored first page for `key`, read once per mount and only after
   * hydration. Null when storage holds nothing under the key, holds an entry
   * older than CATALOG_SESSION_MAX_AGE_MS, or cannot be reached at all.
   */
  useSeed(key: string): Paged<MemeToken> | null;
  /**
   * Stores `page` under `key` whenever it is a page this tab has not stored
   * already. Pass the first page the query holds, or undefined while it holds
   * none: a query with no pages of its own writes nothing, which is what keeps
   * a seed's age honest while the service is down.
   */
  useWriteBack(key: string, page: Paged<MemeToken> | undefined): void;
  /** Tests only: forget what this tab has written, for a fresh tab. */
  __forgetWritesForTests(): void;
}

/**
 * Binds the seed and write-back pair to a session cache. Each caller passes its
 * own cache, read lazily so a test can swap the storage underneath it.
 */
export function createCatalogPageSession(cacheFor: () => SessionCache): CatalogPageSession {
  // The first page this tab last stored, per key. Compared by identity, which
  // is exactly right against a query cache that shares structure: a page that
  // did not change is the same object, so a later page landing in the same walk
  // never re-dates the first one, and a walk that takes twenty-four minutes
  // cannot end by stamping a twenty-four minute old first page as current.
  //
  // A seed read back out is never one of these objects either, because it is
  // never put into the query, so a stored page is never written back over
  // itself with a fresh age. That is what would keep a stale list alive
  // indefinitely.
  const written = new Map<string, Paged<MemeToken>>();

  function useSeed(key: string): Paged<MemeToken> | null {
    const hydrated = useHydrated();
    return useMemo(() => {
      if (!hydrated) return null;
      return cacheFor().read<Paged<MemeToken>>(key, CATALOG_SESSION_MAX_AGE_MS)?.data ?? null;
    }, [hydrated, key]);
  }

  function useWriteBack(key: string, page: Paged<MemeToken> | undefined): void {
    useEffect(() => {
      if (page === undefined || written.get(key) === page) return;
      written.set(key, page);
      cacheFor().write(key, page);
    }, [key, page]);
  }

  return {
    useSeed,
    useWriteBack,
    __forgetWritesForTests: () => written.clear(),
  };
}

const catalogSession = createCatalogPageSession(catalogCache);

/**
 * Tests only: point the catalogue's session cache at an in-memory Storage, null
 * for a tab with no storage at all, or undefined to go back to
 * window.sessionStorage. Drops the cache and what it holds, so each test starts
 * from a fresh tab.
 */
export function __setCatalogSessionStorageForTests(storage: Storage | null | undefined): void {
  storageOverride = storage;
  cache = null;
  catalogSession.__forgetWritesForTests();
}

const subscribeToNothing = () => () => undefined;

// False while rendering on the server and during hydration, true after. Storage
// is only read once this is true, so the client's first frame is the server's.
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

/** The unfiltered catalogue's stored first page for `key`. See useSeed. */
export function useCatalogSeed(key: string): Paged<MemeToken> | null {
  return catalogSession.useSeed(key);
}

/** Stores the unfiltered catalogue's first page under `key`. See useWriteBack. */
export function useCatalogWriteBack(key: string, page: Paged<MemeToken> | undefined): void {
  catalogSession.useWriteBack(key, page);
}
