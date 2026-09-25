import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memeToken } from "@/lib/meme/fixture";

// The contract's detail-route semantics for Solana: 502 PROVIDER_ERROR means
// every RPC provider was unavailable, so retry with exponential backoff and
// show a temporary state; 404 TOKEN_NOT_FOUND is a confirmed absence. Neither
// is stored as a token that does not exist.

const api = vi.hoisted(() => ({
  fetchToken: vi.fn(),
  fetchTokenCatalogPage: vi.fn(),
  fetchTrendingTokens: vi.fn(),
  searchTokens: vi.fn(),
}));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchToken: api.fetchToken,
  fetchTokenCatalogPage: api.fetchTokenCatalogPage,
  fetchTrendingTokens: api.fetchTrendingTokens,
  searchTokens: api.searchTokens,
}));

import { TradeApiError, type MemeToken } from "@/lib/meme/api";
import {
  CATALOG_PAGE_INTERVAL_MS,
  CATALOG_RATE_LIMIT_ATTEMPTS,
  CATALOG_RATE_LIMIT_BASE_MS,
} from "@/lib/meme/catalog";
import {
  TRENDING_REFRESH_MS,
  useMemeCatalog,
  useMemeSearch,
  useMemeToken,
  useTrendingMemes,
} from "@/features/trade/hooks/use-meme-tokens";
import { __setCatalogSessionStorageForTests } from "@/features/trade/hooks/use-meme-catalog-session";

const MINT = { address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp", chainId: 101 };
const providerError = () => new TradeApiError("PROVIDER_ERROR", "rpc down", 502, "req-502");
const notFound = () => new TradeApiError("TOKEN_NOT_FOUND", "absent", 404, "req-404");

function setup(queries: { retry?: false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, ...queries } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

// TanStack delivers a settled state to observers on a zero-delay timer, so an
// assertion about what the hook reports needs the tick after the fetch settles.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const settle = () => advance(1);

// The walk is paced: a page lands, and the next is asked for one interval
// later. So a walk needs an interval per page, not a tick. Ten intervals
// covers every catalogue these tests serve.
async function walked(pages = 10) {
  for (let i = 0; i < pages; i += 1) await advance(CATALOG_PAGE_INTERVAL_MS + 10);
}

// These cases are about how the catalogue is read and paged, not about the
// copy it keeps in sessionStorage, and a stored first page would fill the rows
// of a test asserting they are empty until the service answers. Run them in a
// tab with no storage, so every page is a real request. The session copy has
// its own suite, use-meme-catalog-session.test.tsx.
beforeEach(() => __setCatalogSessionStorageForTests(null));
afterEach(() => __setCatalogSessionStorageForTests(undefined));

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchToken.mockReset();
  api.fetchTokenCatalogPage.mockReset();
  api.fetchTrendingTokens.mockReset();
  api.searchTokens.mockReset();
  api.searchTokens.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("useMemeToken on a provider outage", () => {
  it("retries a 502 four times with exponential backoff, then says it is temporary", async () => {
    api.fetchToken.mockRejectedValue(providerError());
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });

    await advance(0);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    // 1 s, 2 s, 4 s, 8 s between attempts.
    await advance(999);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.fetchToken).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(3);
    await advance(4_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(4);
    expect(result.current.unavailable).toBeNull();
    await advance(8_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(5);

    await settle();
    expect(result.current.unavailable).toBe("temporary");
    expect(result.current.token).toBeNull();
    // No fifth retry, and nothing on a timer either.
    await advance(10_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(5);
  });

  it("recovers the moment a retry succeeds", async () => {
    api.fetchToken
      .mockRejectedValueOnce(providerError())
      .mockResolvedValueOnce(memeToken({ symbol: "HACHI" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(1_000);
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");
    expect(result.current.unavailable).toBeNull();
  });
});

describe("useMemeToken on a missing token", () => {
  it("does not retry a 404 and says not found", async () => {
    api.fetchToken.mockRejectedValue(notFound());
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(0);
    await advance(20_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe("not-found");
  });
});

describe("neither failure is a negative cache entry", () => {
  it("stores no token for the failed read, so the next read asks again", async () => {
    api.fetchToken.mockRejectedValue(notFound());
    const { client, wrapper } = setup();
    renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(0);
    expect(client.getQueryData(["meme", "token", MINT.chainId, MINT.address])).toBeUndefined();
  });

  it("keeps the last good read on screen when a later poll hits a 502", async () => {
    api.fetchToken.mockResolvedValueOnce(memeToken({ symbol: "HACHI" }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");

    api.fetchToken.mockRejectedValue(providerError());
    await act(async () => {
      void client.refetchQueries({ queryKey: ["meme", "token"] });
    });
    await advance(1_000 + 2_000 + 4_000 + 8_000);
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");
    expect(result.current.unavailable).toBe("temporary");
  });
});

// The catalogue is read whole on the first load: pages of 500 per the
// contract, "until page * limit >= total", walked one after another without a
// surface asking, and then held. The count is the server's total; what the
// discovery view keeps is shownCount.
describe("useMemeCatalog reads the whole catalogue once", () => {
  const LIMIT = 500;
  const TOTAL = 1_200; // three pages of 500
  const row = (n: number, extra: Parameters<typeof memeToken>[0] = {}) =>
    memeToken({ symbol: `C${n}`, address: `0x${String(n).padStart(40, "0")}`, ...extra });

  // Each page takes a moment to arrive, as one does. The walk asks for the
  // next only once the last has landed, so a page's worth of rows is on screen
  // while the rest of the catalogue is still coming.
  function servePages() {
    api.fetchTokenCatalogPage.mockImplementation(async (page: number) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const start = (page - 1) * LIMIT;
      const count = Math.min(LIMIT, TOTAL - start);
      const items = Array.from({ length: count }, (_, i) =>
        // Every tenth row is HIGH risk: curated drops it, All keeps it.
        row(start + i, (start + i) % 10 === 0 ? { riskLevel: "HIGH" } : {})
      );
      // The service shifted a row onto the next page while the reader
      // scrolled: page 2 repeats the last row of page 1.
      if (page === 2) items.unshift(row(start - 1));
      return { items, meta: { page, limit: LIMIT, total: TOTAL } };
    });
  }

  it("walks every page on load, merges them, and stops at the server's total", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked();
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(api.fetchTokenCatalogPage).toHaveBeenLastCalledWith(3, undefined);
    expect(result.current.total).toBe(TOTAL);
    expect(result.current.loaded).toBe(TOTAL);
    expect(result.current.hasMore).toBe(false);
    // The row page 2 repeated from page 1 is listed once.
    const keys = result.current.tokens.map((t) => `${t.chainId}:${t.address}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.current.tokens).toHaveLength(TOTAL);
  });

  it("paints the first page while the rest of the walk is still running", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await settle();
    await settle();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tokens).toHaveLength(500);
    expect(result.current.total).toBe(TOTAL);
  });

  it("asks for nothing more once the walk is done: no timer, no refetch on a remount", async () => {
    servePages();
    const { wrapper } = setup();
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);

    // An hour of sitting on the page.
    await advance(60 * 60_000);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);

    // And a surface that mounts the hook again reads what is held. Only a
    // reload starts over, and a reload starts with an empty client.
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);
    expect(result.current.tokens).toHaveLength(TOTAL);
  });

  it("stops the walk on a failed page rather than asking again on every render", async () => {
    api.fetchTokenCatalogPage
      .mockImplementationOnce(async () => ({
        items: [row(1)],
        meta: { page: 1, limit: 1, total: 3 },
      }))
      .mockRejectedValue(new TradeApiError("SERVICE_UNAVAILABLE", "down", 503));
    const { wrapper } = setup({ retry: false });
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked();
    // Page 1, then the page that failed, and no more.
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(result.current.loadMoreFailed).toBe(true);
    expect(result.current.tokens).toHaveLength(1);
    await advance(60 * 60_000);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);
  });

  it("does not double a request when a surface asks for more mid-walk", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await settle();
    await settle();
    // The desk's lookahead asking for the page the walk is already fetching.
    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await walked();
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it("retries the page that failed when the reader asks, and finishes the walk", async () => {
    let failing = true;
    api.fetchTokenCatalogPage.mockImplementation(async (page: number) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (page === 2 && failing) throw new TradeApiError("SERVICE_UNAVAILABLE", "down", 503);
      return { items: [row(page)], meta: { page, limit: 1, total: 2 } };
    });
    const { wrapper } = setup({ retry: false });
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked();
    expect(result.current.loadMoreFailed).toBe(true);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);

    failing = false;
    await act(async () => {
      result.current.loadMore();
    });
    await walked();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);
    expect(result.current.loadMoreFailed).toBe(false);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1", "C2"]);
  });

  it("switches views over the pages it holds, without asking again", async () => {
    servePages();
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ view }: { view: "curated" | "all" }) => useMemeCatalog({ view }),
      { wrapper, initialProps: { view: "curated" } }
    );
    await walked();
    // Nine of every ten rows, over the whole catalogue.
    expect(result.current.shownCount).toBe(1_080);
    rerender({ view: "all" });
    await settle();
    expect(result.current.shownCount).toBe(TOTAL);
    expect(result.current.total).toBe(TOTAL);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);
  });

  it("waits the pacing interval between pages instead of firing them back to back", async () => {
    servePages();
    const { wrapper } = setup();
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    // Page 1 is the query's own first read, so it goes out at once.
    await settle();
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(1);
    // And nothing follows it until a whole interval has passed.
    await advance(CATALOG_PAGE_INTERVAL_MS - 10);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(1);
    await advance(10);
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);
  });

  it("grows the list the reader sees as each page lands", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await settle();
    await settle();
    expect(result.current.loaded).toBe(500);
    expect(result.current.progress.status).toBe("walking");
    await walked(1);
    expect(result.current.loaded).toBe(1_000);
    await walked(1);
    expect(result.current.loaded).toBe(TOTAL);
    expect(result.current.progress.status).toBe("complete");
  });

  it("reports honest progress: rows held, the server's total, pages and page count", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    expect(result.current.progress.status).toBe("loading");
    expect(result.current.progress.total).toBeNull();
    await settle();
    await settle();
    expect(result.current.progress).toMatchObject({
      status: "walking",
      loaded: 500,
      total: TOTAL,
      pages: 1,
      pageCount: 3,
      rateLimited: false,
    });
    await walked();
    expect(result.current.progress).toMatchObject({
      status: "complete",
      loaded: TOTAL,
      pages: 3,
      pageCount: 3,
      resumesAt: null,
    });
  });

  it("scopes every page to the chain it was given", async () => {
    servePages();
    const { wrapper } = setup();
    renderHook(() => useMemeCatalog({ chain: "base" }), { wrapper });
    await walked();
    expect(api.fetchTokenCatalogPage.mock.calls).toEqual([
      [1, "base"],
      [2, "base"],
      [3, "base"],
    ]);
  });
});

// The gateway rate-limits /v1 and every user shares the Next.js server's IP,
// so a 429 partway through a 289-page walk is a normal event. It used to end
// the walk, which is exactly why the reader saw a short list: the catalogue
// stopped at whatever page the limiter happened to hit.
describe("the catalogue walk survives a rate limit", () => {
  const row = (n: number) =>
    memeToken({ symbol: `C${n}`, address: `0x${String(n).padStart(40, "0")}` });
  const rateLimited = (retryAfterMs: number | null = null) =>
    new TradeApiError("SERVICE_UNAVAILABLE", "slow down", 429, null, retryAfterMs);

  // Three pages of one row each, with page 2 rate limited until `limited` is
  // cleared. One row a page keeps the arithmetic readable.
  function serveWithLimiter(limited: { on: boolean }, error = () => rateLimited()) {
    api.fetchTokenCatalogPage.mockImplementation(async (page: number) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (page === 2 && limited.on) throw error();
      return { items: [row(page)], meta: { page, limit: 1, total: 3 } };
    });
  }

  it("backs off and resumes rather than abandoning the catalogue", async () => {
    const limited = { on: true };
    serveWithLimiter(limited);
    const { wrapper } = setup({ retry: false });
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });

    await walked(1);
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(result.current.progress.status).toBe("rate-limited");
    expect(result.current.progress.rateLimited).toBe(true);
    // The pages already held stay on screen through it.
    expect(result.current.tokens).toHaveLength(1);

    // It does not ask again in a tight loop: a whole pacing interval passes
    // with no second attempt.
    await advance(CATALOG_PAGE_INTERVAL_MS);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);

    // Once the back-off is up it asks again, and the walk finishes.
    limited.on = false;
    await advance(CATALOG_RATE_LIMIT_BASE_MS);
    await walked(3);
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 2, 3]);
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1", "C2", "C3"]);
    expect(result.current.progress.status).toBe("complete");
  });

  it("waits as long as the gateway's Retry-After asked", async () => {
    const limited = { on: true };
    serveWithLimiter(limited, () => rateLimited(90_000));
    const { wrapper } = setup({ retry: false });
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked(1);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);
    // The default back-off would have asked again by now; the header says wait.
    await advance(CATALOG_RATE_LIMIT_BASE_MS);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);
    limited.on = false;
    await advance(90_000 - CATALOG_RATE_LIMIT_BASE_MS);
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(3);
  });

  it("gives up after repeated rate limiting, says it stalled, and resumes when asked", async () => {
    const limited = { on: true };
    serveWithLimiter(limited);
    const { wrapper } = setup({ retry: false });
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked(1);

    // Each attempt waits twice as long as the last, up to the cap.
    for (let attempt = 1; attempt <= CATALOG_RATE_LIMIT_ATTEMPTS; attempt += 1) {
      await advance(CATALOG_RATE_LIMIT_BASE_MS * 2 ** attempt);
      await settle();
    }
    const attempts = api.fetchTokenCatalogPage.mock.calls.length;
    // Page 1, the walk's own attempt at page 2, then one attempt per back-off.
    expect(attempts).toBe(2 + CATALOG_RATE_LIMIT_ATTEMPTS);
    expect(result.current.progress.status).toBe("stalled");
    expect(result.current.progress.rateLimited).toBe(true);
    // Stalled means stopped, not looping: an hour passes and nothing is asked.
    await advance(60 * 60_000);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(attempts);

    // The failure is not swallowed either: the caller can see it.
    expect(result.current.loadMoreFailed).toBe(true);

    limited.on = false;
    await act(async () => {
      result.current.progress.retry();
    });
    await walked(3);
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1", "C2", "C3"]);
    expect(result.current.progress.status).toBe("complete");
  });

  it("does not turn a 429 into three more requests through the query's own retry", async () => {
    const limited = { on: true };
    serveWithLimiter(limited);
    const { wrapper } = setup();
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await walked(1);
    // Exactly one attempt at page 2, however the client is configured.
    expect(api.fetchTokenCatalogPage.mock.calls.filter((c) => c[0] === 2)).toHaveLength(1);
    await advance(30_000);
    expect(api.fetchTokenCatalogPage.mock.calls.filter((c) => c[0] === 2)).toHaveLength(2);
  });
});

// The rail on the dashboard and the simple view. Trending used to poll every
// thirty seconds here, which is what the gateway's rate limiter read as an
// attack: /v1 allows 100 requests a minute per IP and every user of the app
// shares the Next.js server's IP.
describe("useTrendingMemes", () => {
  const trending = (symbol: string) => ({
    items: [memeToken({ symbol })],
    meta: { page: 1, limit: 500, total: 1 },
    shownCount: 1,
    source: "trending" as const,
    rankedCount: 1,
    degraded: null,
  });

  it("reads once and then holds what it read", async () => {
    api.fetchTrendingTokens.mockResolvedValue(trending("HACHI"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(1);
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["HACHI"]);
    expect(result.current.isRefreshing).toBe(false);
  });

  it("does not poll on a short interval", async () => {
    api.fetchTrendingTokens.mockResolvedValue(trending("HACHI"));
    const { wrapper } = setup();
    renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    for (const ms of [30_000, 60_000, 120_000]) {
      await advance(ms);
      expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(1);
    }
  });

  it("reads again once ten minutes have passed, and not a tick before", async () => {
    api.fetchTrendingTokens.mockResolvedValue(trending("HACHI"));
    const { wrapper } = setup();
    renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    await advance(TRENDING_REFRESH_MS - 10);
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(1);
    await advance(10);
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(2);
  });

  it("asks less often, never more, once the service stops answering", async () => {
    api.fetchTrendingTokens.mockRejectedValue(new Error("Can't reach the server right now"));
    const { wrapper } = setup({ retry: false });
    renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(1);

    // The app-wide back-off drops a failing query to sixty seconds, which for
    // this read would be ten times the healthy rate and the poll that took the
    // service down. A whole healthy interval passes with nothing asked.
    await advance(TRENDING_REFRESH_MS);
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(1);

    // It backs off rather than stopping, so a service that comes back is still
    // noticed without a reload.
    await advance(TRENDING_REFRESH_MS);
    await settle();
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(2);
  });

  it("passes the ranking's degradation through, so the rail can say what it is showing", async () => {
    api.fetchTrendingTokens.mockResolvedValue({
      ...trending("BRETT"),
      source: "catalog" as const,
      rankedCount: 100,
      degraded: "no-rated-rows" as const,
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    expect(result.current.source).toBe("catalog");
    expect(result.current.degraded).toBe("no-rated-rows");
    expect(result.current.rankedCount).toBe(100);
  });

  it("reports an undegraded ranking as exactly that", async () => {
    api.fetchTrendingTokens.mockResolvedValue(trending("HACHI"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    expect(result.current.source).toBe("trending");
    expect(result.current.degraded).toBeNull();
  });

  it("reads on demand however fresh the rail is", async () => {
    api.fetchTrendingTokens.mockResolvedValue(trending("HACHI"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useTrendingMemes(), { wrapper });
    await settle();
    api.fetchTrendingTokens.mockResolvedValue(trending("BRETT"));
    await act(async () => {
      await result.current.refetch();
    });
    await settle();
    expect(api.fetchTrendingTokens).toHaveBeenCalledTimes(2);
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["BRETT"]);
  });
});

// The search box is not a name box. A reader arrives with a contract address
// out of a group chat, a market cap off a chart or a launch time, and the
// service only matches names and symbols, so the cached catalogue is matched
// here as well and the two answers are unioned.
describe("useMemeSearch", () => {
  const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  // The same Base contract the service and the catalogue spell differently.
  const CHECKSUMMED = "0xFeEdFaCe00000000000000000000000000001111";

  const bonk = memeToken({
    symbol: "BONK",
    chainId: 101,
    address: MINT,
    marketCapUsd: "1530000",
    pairCreatedAt: new Date(Date.now() - 3 * 1440 * 60_000 - 60_000).toISOString(),
  });
  const pepe = memeToken({
    symbol: "PEPE",
    chainId: 8453,
    address: CHECKSUMMED.toLowerCase(),
    marketCapUsd: "880000",
    pairCreatedAt: new Date(Date.now() - 400 * 60_000).toISOString(),
  });
  const catalogue = [bonk, pepe];

  function searchHook(initial = "", tokens: MemeToken[] = catalogue) {
    const { wrapper } = setup({ retry: false });
    return renderHook(({ q }: { q: string }) => useMemeSearch(q, "all", tokens), {
      wrapper,
      initialProps: { q: initial },
    });
  }

  // The debounce, then the tick TanStack needs to hand the result to observers.
  const searched = () => advance(351);

  it("is not searching at all on an empty query, so the caller keeps its list", async () => {
    const { result } = searchHook("");
    await searched();
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(api.searchTokens).not.toHaveBeenCalled();
  });

  it("matches a contract address against the cached rows", async () => {
    const { result } = searchHook(MINT.slice(0, 12));
    expect(result.current.active).toBe(true);
    expect(result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);
  });

  it("keeps a Solana mint case sensitive and a Base contract case blind", async () => {
    const wrongCase = searchHook(MINT.slice(0, 12).toLowerCase());
    expect(wrongCase.result.current.results).toEqual([]);

    const checksummed = searchHook(CHECKSUMMED);
    expect(checksummed.result.current.results.map((t) => t.symbol)).toEqual(["PEPE"]);
  });

  it("matches a market cap typed the way a chart shows one", async () => {
    const { result } = searchHook("$1.5M");
    expect(result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);
  });

  it("matches an age", async () => {
    const days = searchHook("3d");
    expect(days.result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);

    const hours = searchHook("6h");
    expect(hours.result.current.results.map((t) => t.symbol)).toEqual(["PEPE"]);
  });

  it("leaves a caller with no cached rows alone until the service length", async () => {
    // The grid, the trending list and the pro picker hand no catalogue, so a
    // single character there must keep showing their own list rather than
    // emptying it against a local match that cannot happen.
    const { result } = searchHook("B", []);
    expect(result.current.active).toBe(false);
    await searched();
    expect(api.searchTokens).not.toHaveBeenCalled();
  });

  it("answers a single character from the cache and never asks the service", async () => {
    // A digit out of a mint, which is how a pasted address starts arriving.
    const { result } = searchHook("7");
    expect(result.current.active).toBe(true);
    expect(result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);
    await searched();
    expect(api.searchTokens).not.toHaveBeenCalled();
  });

  it("appends what the service found beyond the cache, and lists a row once", async () => {
    // The service answers with a coin the catalogue does not hold, and with one
    // it does, spelled in the other case.
    api.searchTokens.mockResolvedValue([
      memeToken({ symbol: "PEPE", chainId: 8453, address: CHECKSUMMED }),
      memeToken({ symbol: "PEPECOIN", chainId: 8453, address: "0xbeef" }),
    ]);
    const { result } = searchHook("pepe");
    expect(result.current.results.map((t) => t.symbol)).toEqual(["PEPE"]);
    await searched();
    await settle();
    expect(api.searchTokens).toHaveBeenCalledWith("pepe", "all");
    expect(result.current.results.map((t) => t.symbol)).toEqual(["PEPE", "PEPECOIN"]);
  });

  it("shows the cached matches rather than a spinner while the service catches up", async () => {
    api.searchTokens.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return [];
    });
    const { result } = searchHook("BONK");
    expect(result.current.searching).toBe(false);
    expect(result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);

    // A query nothing cached answers is a search still running.
    const { result: miss } = searchHook("zzz");
    expect(miss.current.searching).toBe(true);
    expect(miss.current.results).toEqual([]);
  });

  it("does not call a search failed when the cache already answered it", async () => {
    api.searchTokens.mockRejectedValue(new TradeApiError("SERVICE_UNAVAILABLE", "down", 503));
    const { result } = searchHook("BONK");
    await searched();
    await settle();
    expect(result.current.error).toBeNull();
    expect(result.current.results.map((t) => t.symbol)).toEqual(["BONK"]);
  });

  it("reports the failure when there is nothing else to show", async () => {
    api.searchTokens.mockRejectedValue(new TradeApiError("SERVICE_UNAVAILABLE", "down", 503));
    const { result } = searchHook("zzz");
    await searched();
    await settle();
    expect(result.current.error).toBeInstanceOf(TradeApiError);
    expect(result.current.results).toEqual([]);
  });
});
