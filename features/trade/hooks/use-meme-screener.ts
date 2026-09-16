"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { fetchScreenerPage, fetchTrendingBoard, type MemeToken } from "@/lib/meme/api";
import {
  mergeCatalogPages,
  nextCatalogPage,
  rankableHere,
  tradableHere,
  type DiscoveryView,
  type Paged,
} from "@/lib/meme/catalog";
import {
  DEFAULT_TIMEFRAME,
  EMPTY_FILTERS,
  SCREENER_PRESETS,
  activeCount,
  applyScreener,
  hasBounds,
  isMemeTimeframe,
  isScreenerFilters,
  presetFor,
  screenerActive,
  screenerQuery,
  trendingQuery,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerPresetId,
  type ScreenerSort,
} from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";
import { createSessionCache, type SessionCache, type SessionCacheEntry } from "@/lib/session-cache";
import { useSectionActive } from "@/components/ui/section-visibility";
import type { useMemeCatalog } from "@/features/trade/hooks/use-meme-tokens";
import { pollUnlessFailing } from "@/lib/query-poll";

// The market screener and the Trending strip's data, shared by the desk and
// the phone tab (ADR-2026-09-15-meme-trending-screener, 2.4 and 2.5).
//
// The query string is the cache key, so equal filters share one entry and a
// change that does not alter the string (a timeframe nothing depends on, the
// view) asks for nothing. Results are also kept in sessionStorage, deliberately
// not in the localStorage snapshot: the "meme-screener" key prefix is not in
// PERSISTED_PREFIXES.

export const SCREENER_STALE_MS = 60_000;
export const SCREENER_SESSION_MAX_AGE_MS = 5 * 60_000;
export const TRENDING_REFRESH_MS = 120_000;

const SESSION_NAMESPACE = "wsws.meme-screener";
const SESSION_VERSION = 1;
const SESSION_MAX_ENTRIES = 12;
const UI_KEY = "ui";

interface ScreenerSession {
  cache: SessionCache;
  // The dataUpdatedAt of what this tab last read from or wrote to storage,
  // per key. Data that came out of storage is not newer than this, so it is
  // never written back as if it were fresh, which would reset its age.
  heldAt: Map<string, number>;
}

let session: ScreenerSession | null = null;
let storageOverride: Storage | null | undefined;

// Created on first use, not at module load: creating the cache probes
// window.sessionStorage, which does not exist during server rendering. Every
// call below happens on the client (after hydration, in an effect, in a query
// function or in an event handler).
function screenerSession(): ScreenerSession {
  session ??= {
    cache: createSessionCache({
      namespace: SESSION_NAMESPACE,
      version: SESSION_VERSION,
      maxEntries: SESSION_MAX_ENTRIES,
      storage: storageOverride,
    }),
    heldAt: new Map(),
  };
  return session;
}

/**
 * Tests only: point the screener's session cache at an in-memory Storage, or
 * pass undefined to go back to window.sessionStorage. Drops the cache and what
 * it knows, so each test starts from an empty tab.
 */
export function __setScreenerSessionStorageForTests(storage: Storage | null | undefined): void {
  storageOverride = storage;
  session = null;
}

function readSession<T>(key: string, maxAgeMs: number): SessionCacheEntry<T> | null {
  const { cache, heldAt } = screenerSession();
  const entry = cache.read<T>(key, maxAgeMs);
  if (entry !== null) heldAt.set(key, Math.max(heldAt.get(key) ?? 0, entry.savedAt));
  return entry;
}

function writeSession<T>(key: string, data: T, updatedAt: number): void {
  const { cache, heldAt } = screenerSession();
  if (updatedAt <= (heldAt.get(key) ?? 0)) return;
  cache.write(key, data);
  heldAt.set(key, updatedAt);
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

type SessionKind = "trending" | "list";

// The session entry to seed a query with, when the query holds nothing yet.
// Read only after hydration, so the server and the hydrating client both
// render an empty query. When hydration finishes, the entry is handed over as
// initialData: TanStack applies initialData to a query that exists but has no
// data, so the query built empty (and disabled) during hydration still takes
// it, and a fresh entry costs no request.
function useSessionSeed<T>(kind: SessionKind, query: string, hydrated: boolean) {
  const client = useQueryClient();
  const sessionKey = `${kind}:${query}`;
  const queryKey = useMemo(() => ["meme-screener", kind, query] as const, [kind, query]);
  const seed = useMemo(() => {
    if (!hydrated || client.getQueryData(queryKey) !== undefined) return null;
    return readSession<T>(sessionKey, SCREENER_SESSION_MAX_AGE_MS);
  }, [client, hydrated, queryKey, sessionKey]);
  return { queryKey, sessionKey, seed };
}

// Writes each result newer than what storage holds back to the session cache.
function useSessionWriteBack<T>(sessionKey: string, data: T | undefined, updatedAt: number) {
  useEffect(() => {
    if (data === undefined) return;
    writeSession(sessionKey, data, updatedAt);
  }, [sessionKey, data, updatedAt]);
}

// The Trending strip: the service's trending ranking narrowed by the applied
// bounds (trendingQuery, never the sort). Polls every two minutes, only while
// the tab is visible and the section is on screen. The view is applied here
// over what is held, so switching views never asks again. `enabled` false
// asks for nothing at all, for a surface that mounts the hook before the
// strip is on screen (the phone view renders every tab's hooks).
export function useTrendingBoard({
  query,
  view,
  enabled = true,
}: {
  query: string;
  view: DiscoveryView;
  enabled?: boolean;
}): {
  tokens: MemeToken[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const active = useSectionActive();
  const hydrated = useHydrated();
  const { queryKey, sessionKey, seed } = useSessionSeed<Paged<MemeToken>>(
    "trending",
    query,
    hydrated
  );
  const result = useQuery({
    queryKey,
    queryFn: () => fetchTrendingBoard(query),
    enabled: hydrated && enabled,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.savedAt,
    staleTime: SCREENER_STALE_MS,
    refetchInterval: pollUnlessFailing(TRENDING_REFRESH_MS),
    // `subscribed`, as in useTrendingMemes: off screen the timer stops but the
    // last board stays on screen and refetch still works.
    subscribed: active && enabled,
  });
  useSessionWriteBack(sessionKey, result.data, result.dataUpdatedAt);

  const data = result.data;
  // rankableHere, not tradableHere: this is the strip, and a row with neither a
  // price nor a 24h change has nothing for it to show. See lib/meme/catalog.ts.
  const tokens = useMemo(() => (data ? rankableHere(data, view).items : []), [data, view]);
  const { refetch: refetchQuery } = result;
  const refetch = useCallback(() => {
    void refetchQuery();
  }, [refetchQuery]);
  return {
    tokens,
    // Pending before hydration reads as loading, so the skeleton shows; a
    // surface that switched the board off is not loading anything.
    isLoading: enabled && result.isPending,
    isFetching: result.isFetching,
    error: result.error,
    refetch,
  };
}

// The filtered catalogue, walked like useMemeCatalog: a page of 500 at a time,
// the next only when asked for, and the view applied over the merged pages. It
// hands back the same shape so a surface can page either one with the same
// controls. Nothing is requested while `enabled` is false.
export function useScreenerCatalog({
  query,
  view,
  enabled,
  filters = EMPTY_FILTERS,
  timeframe = DEFAULT_TIMEFRAME,
}: {
  query: string;
  view: DiscoveryView;
  enabled: boolean;
  // Applied again here, over whatever the service returned. The query above is
  // still sent, but as of 2026-09-16 the service accepts every bound and acts
  // on none: maxMarketCapUsd=1000 answers with a $3.49bn coin. Re-applying the
  // same predicate is idempotent, so this is right both before and after the
  // service starts honouring it. See applyScreener in lib/meme/screener.
  filters?: ScreenerFilters;
  timeframe?: MemeTimeframe;
}): ReturnType<typeof useMemeCatalog> {
  const hydrated = useHydrated();
  const { queryKey, sessionKey, seed } = useSessionSeed<InfiniteData<Paged<MemeToken>, number>>(
    "list",
    query,
    hydrated
  );
  const live = hydrated && enabled;
  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchScreenerPage(pageParam, query),
    initialPageParam: 1,
    getNextPageParam: (last) => nextCatalogPage(last.meta),
    enabled: live,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.savedAt,
    staleTime: SCREENER_STALE_MS,
  });
  useSessionWriteBack(sessionKey, result.data, result.dataUpdatedAt);

  const pages = result.data?.pages;
  const merged = useMemo(() => (pages ? mergeCatalogPages(pages) : null), [pages]);
  const shown = useMemo(() => (merged ? tradableHere(merged, view) : null), [merged, view]);
  const screened = useMemo(
    () => (shown ? applyScreener(shown.items, filters, timeframe) : []),
    [shown, filters, timeframe]
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = result;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return {
    tokens: screened,
    total: merged ? merged.meta.total : null,
    loaded: merged?.items.length ?? 0,
    shownCount: shown?.shownCount ?? 0,
    hasMore: hasNextPage,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    loadMoreFailed: result.isFetchNextPageError,
    // A disabled query stays pending forever; that is not loading.
    isLoading: live && result.isPending,
    isFetching: result.isFetching,
    error: result.error,
    refetch: result.refetch,
  };
}

interface ScreenerControls {
  timeframe: MemeTimeframe;
  filters: ScreenerFilters;
}

function isScreenerControls(x: unknown): x is ScreenerControls {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  return (
    "timeframe" in x &&
    "filters" in x &&
    isMemeTimeframe(x.timeframe) &&
    isScreenerFilters(x.filters)
  );
}

// A deep copy, so applied filters never share an object with a frozen preset
// or with EMPTY_FILTERS.
function copyFilters(filters: ScreenerFilters): ScreenerFilters {
  const bounds: ScreenerFilters["bounds"] = {};
  for (const [metric, bound] of Object.entries(filters.bounds) as [
    ScreenerMetric,
    ScreenerFilters["bounds"][ScreenerMetric],
  ][]) {
    if (bound !== undefined) bounds[metric] = { ...bound };
  }
  return { bounds, sort: filters.sort === null ? null : { ...filters.sort } };
}

function emptyFilters(): ScreenerFilters {
  return { bounds: {}, sort: null };
}

const INITIAL_CONTROLS: ScreenerControls = {
  timeframe: DEFAULT_TIMEFRAME,
  filters: emptyFilters(),
};

// The one controller both surfaces use: the applied controls, mirrored to the
// session cache, the two queries they build, and Trending's page.
export function useMemeScreener({
  view,
  trendingPageSize,
  enabled = true,
}: {
  view: DiscoveryView;
  trendingPageSize: number;
  // False keeps the controls but requests nothing, for a surface whose strip
  // and list are not on screen yet.
  enabled?: boolean;
}) {
  const hydrated = useHydrated();

  // The stored controls are read once storage can be, so the server and the
  // hydrating client render the defaults and the restored controls follow in
  // the next frame. Validated, because sessionStorage can hold anything.
  const restored = useMemo(() => {
    if (!hydrated) return null;
    const entry = screenerSession().cache.read<unknown>(UI_KEY, Infinity);
    return entry !== null && isScreenerControls(entry.data) ? entry.data : null;
  }, [hydrated]);
  // Null until the user changes something; until then the restored controls,
  // or the defaults, apply.
  const [chosen, setChosen] = useState<ScreenerControls | null>(null);
  const controls = chosen ?? restored ?? INITIAL_CONTROLS;
  const { timeframe, filters } = controls;

  const commit = useCallback((next: ScreenerControls) => {
    setChosen(next);
    screenerSession().cache.write(UI_KEY, next);
  }, []);

  const setTimeframe = useCallback(
    (tf: MemeTimeframe) => commit({ filters, timeframe: tf }),
    [commit, filters]
  );
  const apply = useCallback(
    (bounds: ScreenerFilters["bounds"]) =>
      commit({ timeframe, filters: copyFilters({ bounds, sort: filters.sort }) }),
    [commit, timeframe, filters]
  );
  const setSort = useCallback(
    (sort: ScreenerSort | null) =>
      commit({ timeframe, filters: copyFilters({ bounds: filters.bounds, sort }) }),
    [commit, timeframe, filters]
  );
  const applyPreset = useCallback(
    (id: ScreenerPresetId) => {
      const preset = SCREENER_PRESETS.find((p) => p.id === id);
      if (preset === undefined) throw new Error(`Unknown screener preset ${id}.`);
      commit({ timeframe, filters: copyFilters(preset.filters) });
    },
    [commit, timeframe]
  );
  const clearBound = useCallback(
    (metric: ScreenerMetric, side: "min" | "max") => {
      const next = copyFilters(filters);
      const bound = next.bounds[metric];
      if (bound === undefined) return;
      delete bound[side];
      if (bound.min === undefined && bound.max === undefined) delete next.bounds[metric];
      commit({ timeframe, filters: next });
    },
    [commit, timeframe, filters]
  );
  const clearAll = useCallback(
    () => commit({ timeframe, filters: emptyFilters() }),
    [commit, timeframe]
  );

  const active = screenerActive(filters);
  const listQuery = screenerQuery(filters, timeframe);
  const boardQuery = trendingQuery(filters, timeframe);

  const list = useScreenerCatalog({
    query: listQuery,
    view,
    enabled: enabled && active,
    filters,
    timeframe,
  });
  const board = useTrendingBoard({ query: boardQuery, view, enabled });

  // The page is held with the query it was chosen under, so a new trending
  // query reads as page 1 without an effect to reset it.
  const [held, setHeld] = useState({ query: boardQuery, page: 1 });
  const size = Math.max(1, Math.floor(trendingPageSize));
  const pages = Math.max(1, Math.ceil(board.tokens.length / size));
  const wanted = held.query === boardQuery ? held.page : 1;
  const trendingPage = Math.min(Math.max(1, wanted), pages);
  const setTrendingPage = useCallback(
    (p: number) => setHeld({ query: boardQuery, page: Math.min(Math.max(1, p), pages) }),
    [boardQuery, pages]
  );
  const boardTokens = board.tokens;
  const pageTokens = useMemo(
    () => boardTokens.slice((trendingPage - 1) * size, trendingPage * size),
    [boardTokens, trendingPage, size]
  );

  return {
    timeframe,
    setTimeframe,
    filters,
    active,
    count: activeCount(filters),
    preset: presetFor(filters),
    apply,
    setSort,
    applyPreset,
    clearBound,
    clearAll,
    listQuery,
    list,
    trending: {
      ...board,
      page: trendingPage,
      pages,
      pageTokens,
      setPage: setTrendingPage,
      filtered: hasBounds(filters),
    },
    // The list query itself: it changes exactly when the list's rows do, so a
    // surface keys its page reset on it.
    resetKey: listQuery,
  };
}
