"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TRENDING_BOARD_LIMIT,
  fetchScreenerPage,
  fetchTrendingBoard,
  type MemeToken,
} from "@/lib/meme/api";
import {
  catalogPageCount,
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
import { memePollUnlessFailing } from "@/lib/meme/poll";
import { createSessionCache, type SessionCache, type SessionCacheEntry } from "@/lib/session-cache";
import { useSectionActive } from "@/components/ui/section-visibility";
import { createCatalogPageSession } from "@/features/trade/hooks/use-meme-catalog-session";
import {
  MEME_CACHE_GC_MS,
  TRENDING_REFRESH_MS,
  catalogPageRetry,
  useCatalogWalk,
  type useMemeCatalog,
} from "@/features/trade/hooks/use-meme-tokens";

// The market screener and the Trending strip's data, shared by the desk and
// the phone tab (ADR-2026-09-15-meme-trending-screener, 2.4 and 2.5).
//
// The query string is the cache key, so equal filters share one entry and a
// change that does not alter the string (a timeframe nothing depends on, the
// view) asks for nothing. Results are also kept in sessionStorage, deliberately
// not in the localStorage snapshot: the "meme-screener" key prefix is not in
// PERSISTED_PREFIXES.
//
// The two surfaces keep a session copy for different reasons, so they keep it
// differently. Trending is one request for a whole board under a ten minute
// freshness window, so its copy is `initialData`: a board written nine minutes
// ago is fresh by the query's own terms, and reusing it is the point. The list
// is a walk of hundreds of pages under `staleTime: Infinity`, so its copy is
// only the first page and only a render fallback. Handing that one over as
// `initialData` would leave a query that is never stale holding data it never
// asked for, which is a reload that reads nothing. See
// use-meme-catalog-session, where the mechanism and the reasoning live.
//
// Neither query goes stale on a timer any more. The one-minute freshness window
// they shared (SCREENER_STALE_MS, now gone) meant every remount past a minute
// paid for the board again, and for an infinite query it meant paying for every
// page held, not just the next.

// How long a trending board out of sessionStorage may be and still be painted.
// A tab that reloads inside this window paints its own copy; past it, the strip
// reads the service again. The list's stored page has the same five minute
// limit, owned by use-meme-catalog-session.
export const SCREENER_SESSION_MAX_AGE_MS = 5 * 60_000;
// One number for both trending surfaces, defined next to the dashboard rail it
// was first fixed on. Re-exported because this module is where the desk's
// trending strip reads it from.
export { TRENDING_REFRESH_MS };

// The trending route cannot be paged: it ignores `page` and answers with up to
// `limit` rows, the contract's maximum being 500. Asking for the maximum means
// the whole board arrives in the one request we are allowed every ten minutes,
// so paging the strip never costs another. The service clamps that to 100
// today, which is the ~100 rows trending actually ranks; the client asks for
// the ceiling either way. One name for it now, in lib/meme/api.

const SESSION_NAMESPACE = "wsws.meme-screener";
// 2: a "list:" entry used to hold the query's whole InfiniteData and now holds
// one page, so an entry written by the old code would be read back as a page
// with no items and merged into a crash. Bumping the version is how this cache
// retires a shape (lib/session-cache), and it is namespace wide, so the
// trending boards and the stored controls are dropped once as well. That costs
// the first load after the deploy one trending request and its restored
// filters, which is worth paying to keep one version number for one namespace.
const SESSION_VERSION = 2;
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

// The filtered list's stored first page, over the screener's own cache. The
// cache is read through the getter rather than captured, so swapping the
// storage for a test swaps what this writes to as well.
const listSession = createCatalogPageSession(() => screenerSession().cache);

/**
 * Tests only: point the screener's session cache at an in-memory Storage, or
 * pass undefined to go back to window.sessionStorage. Drops the cache and what
 * it knows, so each test starts from an empty tab.
 */
export function __setScreenerSessionStorageForTests(storage: Storage | null | undefined): void {
  storageOverride = storage;
  session = null;
  listSession.__forgetWritesForTests();
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

function screenerQueryKey(kind: SessionKind, query: string) {
  return ["meme-screener", kind, query] as const;
}

// The session entry to seed the trending board with, when the query holds
// nothing yet. Read only after hydration, so the server and the hydrating
// client both render an empty query. When hydration finishes, the entry is
// handed over as initialData: TanStack applies initialData to a query that
// exists but has no data, so the query built empty (and disabled) during
// hydration still takes it, and a fresh entry costs no request.
//
// This is trending's alone. The list must never be seeded this way; see the
// note at the top of the file.
function useSessionSeed<T>(kind: SessionKind, query: string, hydrated: boolean) {
  const client = useQueryClient();
  const sessionKey = `${kind}:${query}`;
  const queryKey = useMemo(() => screenerQueryKey(kind, query), [kind, query]);
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
// bounds (trendingQuery, never the sort), the whole board in one request.
//
// It is cached, not polled. Exactly two things refresh it: the ten minute timer
// and `refresh`, the control the strip puts under the user's hand. The timer
// runs only while the tab is visible and the section is on screen.
//
// It takes no view. The strip is always "all": trending rows carry no risk
// assessment, so under "curated" it kept nothing at all. See the comment at the
// row selection below for the decision and the numbers behind it.
// `enabled` false asks for nothing at all, for a surface that mounts the hook
// before the strip is on screen (the phone view renders every tab's hooks).
export function useTrendingBoard({ query, enabled = true }: { query: string; enabled?: boolean }): {
  tokens: MemeToken[];
  isLoading: boolean;
  isFetching: boolean;
  isRefreshing: boolean;
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
    queryFn: () => fetchTrendingBoard(query, TRENDING_BOARD_LIMIT),
    enabled: hydrated && enabled,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.savedAt,
    // Freshness and the timer are the same ten minutes, so a board read less
    // than ten minutes ago is reused as it stands, whether it comes from this
    // observer, another surface on the same query, or the session copy. Past
    // ten minutes it is read again, on the timer or on the next mount.
    staleTime: TRENDING_REFRESH_MS,
    gcTime: MEME_CACHE_GC_MS,
    // The same ten minutes while the service answers, and longer while it does
    // not: backing off must never mean asking more often than the cadence the
    // service was rescued with. See memePollUnlessFailing.
    refetchInterval: memePollUnlessFailing(TRENDING_REFRESH_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // `subscribed`, as in useTrendingMemes: off screen the timer stops but the
    // last board stays on screen and refetch still works.
    subscribed: active && enabled,
  });
  useSessionWriteBack(sessionKey, result.data, result.dataUpdatedAt);

  const data = result.data;
  // rankableHere, not tradableHere: this is the strip, and a row with neither a
  // price nor a 24h change has nothing for it to show. See lib/meme/catalog.ts.
  //
  // "all" rather than the reader's Curated/All choice, deliberately. Trending
  // rows carry no risk assessment (every one comes back UNKNOWN), so under
  // "curated" this strip kept nothing and the rail was empty whatever the
  // toggle said. The toggle still governs the list below, which is where it
  // earns its keep; the strip shows the ranking as the service gives it.
  //
  // The cost, accepted by the maintainer on 2026-09-17: "all" drops the
  // liquidity and volume floors too, and 83 of 100 trending rows sat under the
  // $10,000 liquidity floor when this was measured. See fetchTrendingTokens in
  // lib/meme/api.ts for the same decision and the numbers behind it.
  const tokens = useMemo(() => (data ? rankableHere(data, "all").items : []), [data]);
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
    // A read that is not the first one: what a refresh control shows as busy.
    isRefreshing: result.isRefetching,
    error: result.error,
    refetch,
  };
}

// The filtered catalogue, read exactly like useMemeCatalog: every page of 500
// walked as soon as the first one lands, the view applied over the merged
// pages, and then held. It hands back the same shape, so a surface pages either
// one client side over rows it already has. Nothing is requested while
// `enabled` is false, and nothing refetches it: the desk and the phone read the
// same query, so a filtered list is paid for once per set of filters.
//
// Its session copy is the catalogue's, mechanism and all: the first page only,
// painted while the query holds no pages of its own, and never handed to the
// query. So a reload inside the session window has rows on the first frame and
// still reads the service, which is the whole point of keeping these rows out
// of the localStorage snapshot.
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
  const queryKey = useMemo(() => screenerQueryKey("list", query), [query]);
  const sessionKey = `list:${query}`;
  const seed = listSession.useSeed(sessionKey);
  const live = hydrated && enabled;
  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchScreenerPage(pageParam, query),
    initialPageParam: 1,
    getNextPageParam: (last) => nextCatalogPage(last.meta),
    enabled: live,
    // No initialData. The stored page is merged below instead, so this query
    // still asks for page 1 on every page load.
    //
    // An infinite query that goes stale refetches every page it holds, not
    // just the next one, so a walked list must never go stale on its own: a
    // tab switch would cost the whole walk again. What replaces it is a new
    // query key when the filters change, and refetch() for an explicit retry.
    staleTime: Infinity,
    gcTime: MEME_CACHE_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: catalogPageRetry,
  });

  const pages = result.data?.pages;
  // Only what the service actually returned is stored, and only the first page
  // of it. While the query holds nothing there is nothing to store, which is
  // what keeps a stored page's age honest through an outage.
  listSession.useWriteBack(sessionKey, pages?.[0]);
  const merged = useMemo(() => {
    if (pages) return mergeCatalogPages(pages);
    // The stored first page, while the query holds none of its own. The read
    // still went out, and a failure still reaches the surface through `error`.
    return seed ? mergeCatalogPages([seed]) : null;
  }, [pages, seed]);
  const shown = useMemo(() => (merged ? tradableHere(merged, view) : null), [merged, view]);
  const screened = useMemo(
    () => (shown ? applyScreener(shown.items, filters, timeframe) : []),
    [shown, filters, timeframe]
  );
  const { hasNextPage, isFetching, isFetchingNextPage, fetchNextPage } = result;
  // As in useMemeCatalog: the same paced, rate-limit-aware walk, so a filtered
  // list of 144,002 rows costs the gateway what the unfiltered one does.
  const walk = useCatalogWalk({
    list: query,
    pages: pages?.length ?? 0,
    hasNextPage,
    isFetching,
    failed: result.isFetchNextPageError,
    error: result.error,
    fetchNextPage,
  });
  return {
    tokens: screened,
    total: merged ? merged.meta.total : null,
    loaded: merged?.items.length ?? 0,
    shownCount: shown?.shownCount ?? 0,
    hasMore: hasNextPage,
    loadMore: walk.requestNext,
    isLoadingMore: isFetchingNextPage,
    loadMoreFailed: result.isFetchNextPageError,
    // A disabled query stays pending forever; that is not loading. Nor is a
    // mount that found a stored first page: it has rows on the first frame, so
    // it shows them rather than a skeleton while its own read is in flight.
    isLoading: live && merged === null && result.isPending,
    isFetching: result.isFetching,
    error: result.error,
    refetch: result.refetch,
    progress: {
      status: walk.status,
      loaded: merged?.items.length ?? 0,
      total: merged ? merged.meta.total : null,
      pages: pages?.length ?? 0,
      pageCount: merged ? catalogPageCount(merged.meta) : null,
      rateLimited: walk.rateLimited,
      resumesAt: walk.resumesAt,
      retry: walk.requestNext,
    },
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
  const board = useTrendingBoard({ query: boardQuery, enabled });

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
    // The user's half of trending's refresh contract: the timer is the other
    // half. A press reads the board whatever its age, and the flag is true only
    // for that read, never for the first load, so a refresh control spins when
    // the user asked and not while the strip is still arriving.
    refreshTrending: board.refetch,
    trendingRefreshing: board.isRefreshing,
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
