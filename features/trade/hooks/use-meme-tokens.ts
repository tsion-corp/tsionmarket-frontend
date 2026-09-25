"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  TradeApiError,
  fetchToken,
  fetchTokenCatalog,
  fetchTokenCatalogPage,
  fetchTrendingTokens,
  isRateLimited,
  searchTokens,
  type MemeToken,
  type TrendingDegradation,
} from "@/lib/meme/api";
import {
  CATALOG_PAGE_INTERVAL_MS,
  CATALOG_RATE_LIMIT_ATTEMPTS,
  DEFAULT_DISCOVERY_VIEW,
  catalogBackoffMs,
  catalogKey,
  catalogPageCount,
  isMemecoinHere,
  mergeCatalogPages,
  nextCatalogPage,
  tradableHere,
  type DiscoveryView,
  type Paged,
} from "@/lib/meme/catalog";
import type { MemeChainSlug } from "@/lib/meme/chain";
import { memePollUnlessFailing } from "@/lib/meme/poll";
import { filterMemeTokens, memeSearchTerms } from "@/lib/meme/search";
import {
  useCatalogSeed,
  useCatalogWriteBack,
} from "@/features/trade/hooks/use-meme-catalog-session";
import { useSectionActive } from "@/components/ui/section-visibility";

// How long a trending read counts as current, and how long after it a fresh
// one is taken. Both are the same number, so trending is read at most once
// every ten minutes per browser and never on a shorter timer.
//
// It used to be thirty seconds. The gateway rate-limits /v1 at 100 requests a
// minute per IP and every user of the app shares the Next.js server's IP, so
// that poll read as an attack and took the memecoin service down. The only two
// things that refresh trending now are this timer and a refresh the user
// presses. See ADR-2026-09-15-meme-trending-screener, "Cost and rate limits".
export const TRENDING_REFRESH_MS = 10 * 60_000;

// Trending and the catalogue are held for the life of the tab rather than
// dropped five minutes after the last surface using them unmounts. Leaving the
// page and coming back is not a reason to pay for the whole catalogue again.
// Nothing here is kept on disk, so a reload still starts empty (lib/query-persist).
export const MEME_CACHE_GC_MS = Infinity;

const SEARCH_DEBOUNCE_MS = 350;

// The shortest query the service is asked about. The service is rate limited at
// 30 searches a minute and a single letter would match most of its catalogue,
// so one character never leaves the browser. Matching the rows already cached
// costs nothing, so that half runs from the first character: "7" is a real
// prefix of a mint address, and a reader pasting one should not watch the full
// catalogue sit there until the second character lands.
const REMOTE_SEARCH_MIN_CHARS = 2;

const NO_TOKENS: MemeToken[] = [];

const MINUTE_MS = 60_000;

function subscribeToMinute(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, MINUTE_MS);
  return () => clearInterval(id);
}

const subscribeToNothing = () => () => undefined;

function readMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

const readZero = () => 0;

/**
 * The current minute, for a search that reads as an age ("3d", "45min").
 *
 * It reads zero and subscribes to nothing while no such query is typed, which
 * is nearly always. That matters here: the value feeds the memo that filters
 * the whole catalogue, and a clock that moved on every render would throw that
 * work away for a query whose answer does not depend on the time at all.
 */
function useAgeQueryClock(ticking: boolean): number {
  return useSyncExternalStore(
    ticking ? subscribeToMinute : subscribeToNothing,
    ticking ? readMinute : readZero,
    readZero
  );
}

/**
 * Where a catalogue walk has got to.
 *
 * `loading` nothing held yet; the first page is still on its way.
 * `walking` holding pages, asking for the rest, one every
 *           CATALOG_PAGE_INTERVAL_MS.
 * `rate-limited` the gateway refused a page. The walk is waiting it out and
 *           will resume on its own at `resumesAt`.
 * `stalled` stopped. Either a page failed for a reason that is not a rate
 *           limit, or the rate limit outlasted CATALOG_RATE_LIMIT_ATTEMPTS
 *           attempts. Only `requestNext` restarts it.
 * `complete` every page the server's meta says exists is held.
 */
export type CatalogWalkStatus = "loading" | "walking" | "rate-limited" | "stalled" | "complete";

export interface CatalogWalk {
  /** Ask for the next page now, ignoring the pace. The manual retry. */
  requestNext: () => void;
  status: CatalogWalkStatus;
  /** When the next attempt is due, epoch ms; null when none is scheduled. */
  resumesAt: number | null;
  /** The last page was refused by the gateway's rate limiter. */
  rateLimited: boolean;
}

/**
 * Reads the rest of an infinite catalogue query, a page at a time, until the
 * pages cover the server's total.
 *
 * It is paced. The catalogue is 289 pages of 500 (144,002 rows on 2026-09-16)
 * and firing those as fast as they round-trip is the request spike that took
 * the memecoin service down, so the walk waits CATALOG_PAGE_INTERVAL_MS
 * between pages and finishes over about twenty-four minutes. The reader sees
 * the count and the pagination grow as pages land rather than a list that is
 * complete or nothing.
 *
 * A rate-limited page no longer ends the walk. That is why the lists looked
 * short: one 429 anywhere in the walk stopped it at whatever page it had
 * reached, and the reader was left with a fraction of the catalogue and no
 * sign that anything was missing. Now a 429 backs off, honouring Retry-After
 * when the gateway sends one, and the walk resumes from the same page. After
 * CATALOG_RATE_LIMIT_ATTEMPTS refusals it stops and says so rather than
 * hammering a service that keeps saying no, and `status` carries that state
 * out to the surface. Any other failure still stops the walk at once: a
 * malformed page or an outage is not something to wait out.
 *
 * What drives it is the number of pages held, not the fetching flag. A page
 * that arrives from a warm cache can land without React ever committing a
 * render with the fetch in flight, and a walk hung off that flag alone would
 * stop there. `pages` changes exactly once per page that lands, so the walk
 * asks for the page after the ones it holds.
 *
 * The ledger of what has been asked for is what keeps that honest. The walk
 * and a surface that drives paging itself (the desk's lookahead) both run in
 * the same commit, both see the same "nothing in flight", and both would ask
 * for the same page: TanStack would then cancel the first request and issue a
 * second for the same rows. One mark per list and page count means the page is
 * asked for once, whoever asks first. `list` is the identity of the list being
 * walked, its chain or its filter query, so switching lists starts a new
 * ledger rather than inheriting the last one's marks.
 */
export function useCatalogWalk({
  list,
  pages,
  hasNextPage,
  isFetching,
  failed,
  error,
  fetchNextPage,
}: {
  list: string;
  pages: number;
  hasNextPage: boolean;
  isFetching: boolean;
  failed: boolean;
  /** The failure of the last page, so the walk can tell a 429 from an outage. */
  error: unknown;
  fetchNextPage: () => unknown;
}): CatalogWalk {
  // The ledger of pages already asked for, and how many times in a row the
  // gateway has refused the one being walked. Both are tagged with the list
  // they belong to: switching lists is a new walk, and reading through
  // `ledger()` drops the old marks without an effect that re-renders to do it.
  const walk = useRef({ list, asked: null as string | null, refusals: 0 });
  const ledger = useCallback(() => {
    if (walk.current.list !== list) walk.current = { list, asked: null, refusals: 0 };
    return walk.current;
  }, [list]);

  // Tagged with its list for the same reason. State recorded against a list
  // that is gone simply does not apply.
  const [held, setHeld] = useState<{ list: string; stalled: boolean; resumesAt: number | null }>({
    list,
    stalled: false,
    resumesAt: null,
  });
  const mine = held.list === list;
  const stalled = mine && held.stalled;
  const resumesAt = mine ? held.resumesAt : null;

  const limited = failed && isRateLimited(error);

  const requestNext = useCallback(() => {
    if (!hasNextPage) return;
    const marks = ledger();
    const mark = `${list}:${pages}`;
    // A page that failed is the exception to the ledger: its mark is already
    // written, and retrying it is the whole point of the call.
    if (marks.asked === mark && !failed) return;
    marks.asked = mark;
    // An explicit ask is the reader's own, so it clears whatever the walk had
    // given up on and goes out now rather than at the paced time.
    marks.refusals = 0;
    setHeld({ list, stalled: false, resumesAt: null });
    void fetchNextPage();
  }, [ledger, list, pages, hasNextPage, failed, fetchNextPage]);

  useEffect(() => {
    // Nothing held yet means the first page is still on its way; the query
    // asked for that one itself.
    if (pages < 1 || !hasNextPage || isFetching || stalled) return;
    // A failure that is not a rate limit stops the walk, as it always has.
    if (failed && !limited) return;
    const marks = ledger();
    if (!limited) marks.refusals = 0;
    else if (marks.refusals >= CATALOG_RATE_LIMIT_ATTEMPTS) {
      setHeld({ list, stalled: true, resumesAt: null });
      return;
    }
    const wait = limited
      ? catalogBackoffMs(marks.refusals + 1, retryAfterOf(error))
      : CATALOG_PAGE_INTERVAL_MS;
    setHeld({ list, stalled: false, resumesAt: Date.now() + wait });
    const id = setTimeout(() => {
      if (limited) marks.refusals += 1;
      marks.asked = `${list}:${pages}`;
      setHeld({ list, stalled: false, resumesAt: null });
      void fetchNextPage();
    }, wait);
    return () => clearTimeout(id);
  }, [
    ledger,
    list,
    pages,
    hasNextPage,
    isFetching,
    failed,
    limited,
    error,
    stalled,
    fetchNextPage,
  ]);

  const status: CatalogWalkStatus =
    pages < 1
      ? "loading"
      : !hasNextPage
        ? "complete"
        : stalled || (failed && !limited)
          ? "stalled"
          : limited
            ? "rate-limited"
            : "walking";

  return { requestNext, status, resumesAt, rateLimited: limited };
}

// How long the gateway asked us to wait, when the failure was a rate limit
// that carried a Retry-After.
function retryAfterOf(error: unknown): number | null {
  return error instanceof TradeApiError ? error.retryAfterMs : null;
}

/**
 * What the reader is allowed to know about the walk.
 *
 * Every number here is measured, never estimated: `loaded` is the rows merged
 * out of the pages in hand, `total` is the server's own meta.total, and
 * `pages`/`pageCount` are the pages held against the pages that meta implies.
 * A surface can therefore say "12,500 of 144,002" and be right, and say
 * "paused, the service is rate limiting us" instead of quietly showing a
 * fraction of the market.
 */
export interface CatalogProgress {
  status: CatalogWalkStatus;
  /** Rows held after the pages are merged. */
  loaded: number;
  /** The server's list size; null until the first page lands. */
  total: number | null;
  /** Pages held. */
  pages: number;
  /** Pages the server's meta implies; null until the first page lands. */
  pageCount: number | null;
  rateLimited: boolean;
  /** When the walk resumes by itself, epoch ms; null when nothing is due. */
  resumesAt: number | null;
  /** Restart a stalled walk, or ask for the next page now. */
  retry: () => void;
}

function catalogProgress(
  walk: CatalogWalk,
  merged: Paged<MemeToken> | null,
  pages: number
): CatalogProgress {
  return {
    status: walk.status,
    loaded: merged?.items.length ?? 0,
    total: merged ? merged.meta.total : null,
    pages,
    pageCount: merged ? catalogPageCount(merged.meta) : null,
    rateLimited: walk.rateLimited,
    resumesAt: walk.resumesAt,
    retry: walk.requestNext,
  };
}

// A catalogue page is never retried by the query itself.
//
// The walk owns recovery: a rate-limited page is backed off and asked for
// again, and any other failure stops the walk and hands the reader an explicit
// retry. Letting TanStack fire its own retries underneath that would turn one
// refusal into three requests at exactly the moment the gateway asked us to
// stop, and over a 289-page walk that is the difference between a polite
// background read and the spike that took the service down. The app-wide
// default (lib/query-client.ts) does try to spot a rate limit, but by sniffing
// the message and the code, which misses a 429 whose body the relay rewrote as
// SERVICE_UNAVAILABLE.
export function catalogPageRetry(): boolean {
  return false;
}

export function useTrendingMemes() {
  const active = useSectionActive();
  const query = useQuery({
    queryKey: ["meme", "trending"],
    // Wrapped, not passed by reference: TanStack hands the query function its
    // own context object, which fetchTrendingTokens would read as a view.
    queryFn: () => fetchTrendingTokens(),
    // `subscribed`, not `enabled`. Both stop the timer, but `enabled: false`
    // also parks the query in `pending` with its data unavailable and
    // `refetch()` refused, so scrolling back showed a skeleton. `subscribed`
    // only detaches the observer: the last data stays on screen, `refetch()`
    // still works, and the query drops out of the window-focus herd too.
    subscribed: active,
    staleTime: TRENDING_REFRESH_MS,
    gcTime: MEME_CACHE_GC_MS,
    // Ten minutes while the service answers, and longer while it does not: a
    // read that keeps failing is asked for less often, never more. See
    // memePollUnlessFailing for why the app-wide helper is not used directly.
    refetchInterval: memePollUnlessFailing(TRENDING_REFRESH_MS),
    // A hidden tab is nobody looking at trending coins. The app default says
    // the same, but this query is the one that took the service down, so it
    // states its own terms rather than inheriting them.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const feed = query.data;
  return {
    tokens: feed?.items ?? [],
    isLoading: query.isPending,
    error: query.error,
    // The manual trigger: refetch ignores staleTime, so a press always reads.
    refetch: query.refetch,
    // True only for a read that is not the first one, so a refresh control can
    // show it spinning without flickering during the initial load.
    isRefreshing: query.isRefetching,
    /** Which list these rows are: the ranking, or a page of the catalogue. */
    source: feed?.source ?? null,
    /** Why they are not the ranking, when they are not. */
    degraded: (feed?.degraded ?? null) as TrendingDegradation | null,
    /** How many rows the ranking returned before the view judged them. */
    rankedCount: feed?.rankedCount ?? 0,
  };
}

// The whole catalogue, read once per page load and then held for the tab.
//
// Pages are still read the way the contract says to read them, a page of 500
// "until page * limit >= total" and never an unbounded read, but the walk runs
// on its own instead of waiting for a surface to ask. The cost is the same
// handful of requests either way, and paying it up front means the list, its
// count and its paging are complete from the first frame instead of growing
// under the reader.
//
// Once the walk finishes nothing refetches it: no interval, no refetch on
// mount, on focus or on reconnect, and the rows are not written to localStorage
// (lib/query-persist), so the next real read is the next page load.
//
// The first page is kept in sessionStorage all the same, and that does not
// weaken the line above: it is never handed to the query, only rendered while
// the query holds nothing, so every page load still asks the service for page 1.
// It is there so a first page that fails leaves real coins on screen rather
// than an empty list. See use-meme-catalog-session.
//
// The pages are merged (a row repeated across pages appears once, by
// chainId:address) and the discovery view is applied over the merge, so
// switching between Curated and All re-filters what is already held and asks
// the service for nothing. `total` is the server's catalogue size, `loaded`
// how many of those rows are in hand, `shownCount` how many the view kept.
export function useMemeCatalog({
  view = DEFAULT_DISCOVERY_VIEW,
  chain,
}: { view?: DiscoveryView; chain?: MemeChainSlug } = {}) {
  const sessionKey = `catalog:${chain ?? "all"}`;
  const seed = useCatalogSeed(sessionKey);
  const query = useInfiniteQuery({
    queryKey: ["meme", "catalog", "pages", chain ?? "all"],
    queryFn: ({ pageParam }) => fetchTokenCatalogPage(pageParam, chain),
    initialPageParam: 1,
    getNextPageParam: (last) => nextCatalogPage(last.meta),
    staleTime: Infinity,
    gcTime: MEME_CACHE_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: catalogPageRetry,
  });
  const pages = query.data?.pages;
  // Only what the service actually returned is stored, and only the first page
  // of it. While the query holds nothing there is nothing to store, which is
  // what keeps a stored page's age honest through an outage.
  useCatalogWriteBack(sessionKey, pages?.[0]);
  const merged = useMemo(() => {
    if (pages) return mergeCatalogPages(pages);
    // The stored first page, while the query holds none of its own. A first
    // page that fails leaves the desk on the last good rows instead of on
    // "Memecoin markets are unavailable"; the read still went out, and the
    // surfaces still hear about the failure through `error` below. See
    // use-meme-catalog-session.
    return seed ? mergeCatalogPages([seed]) : null;
  }, [pages, seed]);
  const shown = useMemo(() => (merged ? tradableHere(merged, view) : null), [merged, view]);
  const { hasNextPage, isFetching, isFetchingNextPage, fetchNextPage } = query;
  // The walk, and with it the one way to ask for another page: the surfaces
  // that drive paging themselves go through the same ledger, so a reader
  // reaching the end of the loaded rows never doubles a request the walk has
  // already made. Once the walk is done there is no next page to ask for.
  const walk = useCatalogWalk({
    list: chain ?? "all",
    pages: pages?.length ?? 0,
    hasNextPage,
    isFetching,
    failed: query.isFetchNextPageError,
    error: query.error,
    fetchNextPage,
  });
  return {
    tokens: shown?.items ?? [],
    /** The server's catalogue size; null until a page is in hand, stored or read. */
    total: merged ? merged.meta.total : null,
    loaded: merged?.items.length ?? 0,
    shownCount: shown?.shownCount ?? 0,
    hasMore: hasNextPage,
    loadMore: walk.requestNext,
    isLoadingMore: isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    // Loading means there is nothing to show yet. A mount that found a stored
    // first page has rows on the first frame, so it shows them rather than a
    // skeleton while the read it still makes is in flight.
    isLoading: merged === null && query.isPending,
    isFetching: query.isFetching,
    // A failed "Load more" keeps the pages already held; the error is still
    // reported so the surface can say so. A failure with stored rows on screen
    // is reported too: the desk shows them under a line saying the prices are
    // no longer fresh (MemeDesktopBoard), and the phone grid falls back to the
    // unavailable panel only when there is nothing to show (MemeGrid).
    error: query.error,
    refetch: query.refetch,
    progress: catalogProgress(walk, merged, pages?.length ?? 0),
  };
}

// One server page of the catalogue at a small size, for the pro view's coin
// picker, which pages on the server. The previous page stays on screen while
// the next loads, so paging never blanks the list.
//
// Each page is read once per tab and then held, like the catalogue above: a
// reader stepping back and forth through the picker used to pay for every page
// again every fifteen seconds.
export function useMemeCatalogPage(page: number, limit = 10, chain?: MemeChainSlug) {
  const query = useQuery({
    queryKey: ["meme", "catalog", page, limit, chain ?? "all"],
    queryFn: () => fetchTokenCatalog(page, limit, chain),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: MEME_CACHE_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const total = query.data?.meta.total ?? 0;
  return {
    tokens: query.data?.items ?? [],
    pageCount: Math.max(1, Math.ceil(total / limit)),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * The memecoin search, over two sources at once.
 *
 * The service only matches a name or a symbol, and a reader rarely has either:
 * they have a contract address out of a group chat, a market cap off a chart, a
 * launch time. So the cached catalogue is matched here as well, by
 * `filterMemeTokens`, which reads an address, a venue, a chain, an age and
 * every published figure. Locally matched rows appear the instant a character
 * is typed, and the remote call still reaches the coins the catalogue does not
 * hold. The two are unioned, local first.
 *
 * Nothing in here reads the catalogue again. It is handed in by the caller,
 * which already holds it under `staleTime: Infinity`, so searching costs no
 * request beyond the one the service was going to get anyway.
 *
 * @param raw The query as typed. Trimmed here; empty means no search at all.
 * @param view Curated or All, applied to both sources.
 * @param catalogue The rows already cached, matched locally on every keystroke.
 */
export function useMemeSearch(
  raw: string,
  view: DiscoveryView = DEFAULT_DISCOVERY_VIEW,
  catalogue: MemeToken[] = NO_TOKENS
) {
  // Parsed once per keystroke, never once per row: the row loop reads this.
  // Null is "nothing typed", which is not "nothing matched".
  const terms = useMemo(() => memeSearchTerms(raw), [raw]);

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const q = raw.trim();
    const id = setTimeout(
      () => setDebounced(q.length >= REMOTE_SEARCH_MIN_CHARS ? q : ""),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(id);
  }, [raw]);

  const query = useQuery({
    queryKey: ["meme", "search", debounced],
    queryFn: () => searchTokens(debounced, "all"),
    enabled: debounced.length >= REMOTE_SEARCH_MIN_CHARS,
    staleTime: 30_000,
  });

  // Only an age query depends on the time, so only an age query pays for a
  // clock. See useAgeQueryClock.
  const now = useAgeQueryClock(terms?.age != null);

  const local = useMemo(
    () => (terms === null ? NO_TOKENS : filterMemeTokens(catalogue, terms, now)),
    [catalogue, terms, now]
  );

  const data = query.data;
  const remote = useMemo(
    () => (data ?? NO_TOKENS).filter((token) => isMemecoinHere(token, view)),
    [data, view]
  );

  // The union, de-duplicated on the identity the rest of the catalogue uses:
  // chain plus address, with an EVM address compared case-insensitively and a
  // Solana mint compared exactly (catalogKey). The service and the catalogue
  // spell the same Base contract in different cases often enough that keying on
  // the raw string would list it twice.
  const results = useMemo(() => {
    if (terms === null) return NO_TOKENS;
    if (remote.length === 0) return local;
    const held = new Set(local.map(catalogKey));
    const beyond = remote.filter((token) => !held.has(catalogKey(token)));
    return beyond.length === 0 ? local : [...local, ...beyond];
  }, [terms, local, remote]);

  // The service is only asked about a query of two characters or more, and only
  // after the debounce. "Still searching" covers the wait for the debounce too,
  // otherwise the list flashes "nothing matched" for a third of a second
  // between the keystroke and the request.
  const typed = terms?.text ?? "";
  const wantsRemote = typed.length >= REMOTE_SEARCH_MIN_CHARS;
  const remoteSettled = wantsRemote && debounced === typed && !query.isPending;

  return {
    results,
    // Rows matched from the cache are an answer, so the list shows them rather
    // than a spinner while the service catches up.
    searching: wantsRemote && !remoteSettled && local.length === 0,
    // Whether this hook is the one supplying the list. A single character now
    // counts, because the cache answers it. A caller that hands no catalogue
    // has nothing to answer it with, so for that one a search still begins at
    // the length the service accepts and its own list stays on screen until
    // then.
    active: terms !== null && (catalogue.length > 0 || wantsRemote),
    // A failed search is not "nothing matched"; the list says so instead. A
    // failure with cached rows already matched is not a failed search either:
    // there is a list to show, so the error is only the list's when the union
    // came back empty.
    error: results.length === 0 ? query.error : null,
  };
}

// The contract's detail-route semantics. HTTP 502 PROVIDER_ERROR means every
// Solana RPC provider was unavailable or rate-limited: temporary, so retry with
// exponential backoff. HTTP 404 TOKEN_NOT_FOUND is a lookup that succeeded and
// found nothing: never retried. A failure that never reached the service (no
// TradeApiError) is treated as temporary too. Neither is cached as a missing
// token: a failed query stores no data, and the relay caches only successes.
const TOKEN_RETRIES = 4;
const TOKEN_RETRY_BASE_MS = 1_000;

export type MemeTokenUnavailable = "temporary" | "not-found";

function isTemporary(error: unknown): boolean {
  return !(error instanceof TradeApiError) || error.status === 502;
}

function unavailableReason(error: unknown): MemeTokenUnavailable | null {
  if (!error) return null;
  return error instanceof TradeApiError && error.status === 404 ? "not-found" : "temporary";
}

// Fresh risk-assessed details for the selected token; search rows don't carry
// current risk/tradability, so the trade surface always re-reads this.
// Identity is chainId + address, per the service contract: the detail route
// needs the chain by name, and two chains can carry the same symbol.
export function useMemeToken(identity: Pick<MemeToken, "address" | "chainId"> | null) {
  const active = useSectionActive();
  const address = identity?.address ?? null;
  const chainId = identity?.chainId ?? null;
  const query = useQuery({
    queryKey: ["meme", "token", chainId, address],
    queryFn: () => fetchToken(address as string, chainId as number),
    subscribed: active,
    enabled: !!address && chainId !== null,
    // Read when the coin is picked and when the read goes stale under a
    // remount, never on a timer. This had a thirty second poll, one request per
    // reader per half minute on top of the trending poll, and the two together
    // are what the gateway's rate limiter classified as an attack. What a trade
    // actually executes against is the preview quote, which is taken fresh at
    // the moment of the trade.
    staleTime: 20_000,
    retry: (failureCount, error) => isTemporary(error) && failureCount < TOKEN_RETRIES,
    // 1 s, 2 s, 4 s, 8 s.
    retryDelay: (failureCount) => TOKEN_RETRY_BASE_MS * 2 ** failureCount,
  });
  return {
    // The last good read stays on screen through a later failure.
    token: query.data ?? null,
    isLoading: query.isPending && !!address,
    unavailable: unavailableReason(query.error),
  };
}
