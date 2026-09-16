import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/types";
import type { Paged } from "@/lib/meme/catalog";
import { SCREENER_PRESETS, type ScreenerFilters } from "@/lib/meme/screener";
import { createSessionCache } from "@/lib/session-cache";

// The screener's data layer (ADR-2026-09-15-meme-trending-screener, 2.4 and
// 2.5): a request only when something is applied, one request per distinct
// query, the view applied over what is held, and a sessionStorage copy that
// paints a reload at once without being mistaken for fresh data.

const api = vi.hoisted(() => ({ fetchScreenerPage: vi.fn(), fetchTrendingBoard: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchScreenerPage: api.fetchScreenerPage,
  fetchTrendingBoard: api.fetchTrendingBoard,
}));

import { TradeApiError } from "@/lib/meme/api";
import { isPersistedKey } from "@/lib/query-persist";
import {
  SCREENER_SESSION_MAX_AGE_MS,
  SCREENER_STALE_MS,
  TRENDING_REFRESH_MS,
  __setScreenerSessionStorageForTests,
  useMemeScreener,
  useScreenerCatalog,
  useTrendingBoard,
} from "@/features/trade/hooks/use-meme-screener";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const NOW = Date.parse("2026-09-15T12:00:00Z");
const NAMESPACE = "wsws.meme-screener";

let storage: MemoryStorage;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

// TanStack delivers a settled state on a zero-delay timer, so an assertion
// about what a hook reports needs the tick after the fetch settles.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const settle = () => advance(1);

function row(n: number, extra: Partial<MemeToken> = {}): MemeToken {
  return memeToken({ symbol: `C${n}`, address: `0x${String(n).padStart(40, "0")}`, ...extra });
}

function page(items: MemeToken[], meta: Partial<Paged<MemeToken>["meta"]> = {}) {
  return { items, meta: { page: 1, limit: 500, total: items.length, ...meta } };
}

// An entry as the hook's own cache would have written it, `ageMs` ago.
function storeEntry(key: string, data: unknown, ageMs: number) {
  createSessionCache({
    namespace: NAMESPACE,
    version: 1,
    maxEntries: 12,
    storage,
    now: () => Date.now() - ageMs,
  }).write(key, data);
}

function stored(key: string): { v: number; savedAt: number; data: unknown } | null {
  const raw = storage.getItem(`${NAMESPACE}.${key}`);
  return raw === null ? null : (JSON.parse(raw) as { v: number; savedAt: number; data: unknown });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  storage = new MemoryStorage();
  __setScreenerSessionStorageForTests(storage);
  api.fetchScreenerPage.mockReset();
  api.fetchTrendingBoard.mockReset();
});
afterEach(() => {
  __setScreenerSessionStorageForTests(undefined);
  vi.useRealTimers();
});

describe("the screener's query keys", () => {
  it("are not in the localStorage snapshot", () => {
    expect(isPersistedKey(["meme-screener", "list", "sortBy=age&sortOrder=asc"])).toBe(false);
    expect(isPersistedKey(["meme-screener", "trending", ""])).toBe(false);
  });

  it("uses a minute of freshness, five minutes of session age and a two minute poll", () => {
    expect(SCREENER_STALE_MS).toBe(60_000);
    expect(SCREENER_SESSION_MAX_AGE_MS).toBe(300_000);
    expect(TRENDING_REFRESH_MS).toBe(120_000);
  });
});

describe("useTrendingBoard", () => {
  it("asks once per distinct query and shares a query across hook instances", async () => {
    api.fetchTrendingBoard.mockImplementation(async () => page([row(1), row(2)]));
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useTrendingBoard({ query, view: "curated" }),
      { wrapper, initialProps: { query: "" } }
    );
    await settle();
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
    expect(api.fetchTrendingBoard).toHaveBeenLastCalledWith("");
    expect(result.current.tokens).toHaveLength(2);
    expect(client.getQueryData(["meme-screener", "trending", ""])).toBeDefined();

    rerender({ query: "minLiquidityUsd=10000" });
    await settle();
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(2);
    expect(api.fetchTrendingBoard).toHaveBeenLastCalledWith("minLiquidityUsd=10000");

    // Back to a query already held, and a second surface on the same one.
    rerender({ query: "" });
    renderHook(() => useTrendingBoard({ query: "", view: "all" }), { wrapper });
    await settle();
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(2);
  });

  it("applies the view over what it holds, without asking again", async () => {
    api.fetchTrendingBoard.mockResolvedValue(page([row(1), row(2, { riskLevel: "HIGH" })]));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ view }: { view: "curated" | "all" }) => useTrendingBoard({ query: "", view }),
      { wrapper, initialProps: { view: "curated" } }
    );
    await settle();
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1"]);
    rerender({ view: "all" });
    await settle();
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1", "C2"]);
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
  });

  it("polls every two minutes", async () => {
    api.fetchTrendingBoard.mockResolvedValue(page([row(1)]));
    const { wrapper } = setup();
    renderHook(() => useTrendingBoard({ query: "", view: "all" }), { wrapper });
    await settle();
    await advance(TRENDING_REFRESH_MS - 10);
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
    await advance(10);
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failure as an error with no tokens", async () => {
    const failure = new TradeApiError("PROVIDER_ERROR", "down", 502, "req-1");
    api.fetchTrendingBoard.mockRejectedValue(failure);
    const { wrapper } = setup();
    const { result } = renderHook(() => useTrendingBoard({ query: "", view: "all" }), {
      wrapper,
    });
    await settle();
    expect(result.current.error).toBe(failure);
    expect(result.current.tokens).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(stored("trending:")).toBeNull();
  });

  it("writes a successful result back to sessionStorage under the namespace", async () => {
    api.fetchTrendingBoard.mockResolvedValue(page([row(1), row(2)]));
    const { wrapper } = setup();
    renderHook(() => useTrendingBoard({ query: "minPriceUsd=1", view: "curated" }), { wrapper });
    await settle();
    const entry = stored("trending:minPriceUsd=1");
    expect(entry?.v).toBe(1);
    expect(entry?.savedAt).toBe(NOW);
    expect((entry?.data as Paged<MemeToken>).items.map((t) => t.symbol)).toEqual(["C1", "C2"]);
  });

  describe("from the session cache", () => {
    it("paints an entry under a minute old without asking", async () => {
      storeEntry("trending:", page([row(7)]), 30_000);
      const { wrapper } = setup();
      const { result } = renderHook(() => useTrendingBoard({ query: "", view: "all" }), {
        wrapper,
      });
      expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C7"]);
      expect(result.current.isLoading).toBe(false);
      await settle();
      expect(api.fetchTrendingBoard).not.toHaveBeenCalled();
      // Not written back as if it were new: the stored age is kept.
      expect(stored("trending:")?.savedAt).toBe(NOW - 30_000);
    });

    it("paints an entry over a minute old and refreshes it behind", async () => {
      storeEntry("trending:", page([row(7)]), 90_000);
      api.fetchTrendingBoard.mockResolvedValue(page([row(8)]));
      const { wrapper } = setup();
      const { result } = renderHook(() => useTrendingBoard({ query: "", view: "all" }), {
        wrapper,
      });
      expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C7"]);
      await settle();
      expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
      expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C8"]);
      expect(stored("trending:")?.savedAt).toBe(NOW);
    });

    it("ignores an entry over five minutes old", async () => {
      storeEntry("trending:", page([row(7)]), SCREENER_SESSION_MAX_AGE_MS + 1);
      api.fetchTrendingBoard.mockResolvedValue(page([row(8)]));
      const { wrapper } = setup();
      const { result } = renderHook(() => useTrendingBoard({ query: "", view: "all" }), {
        wrapper,
      });
      expect(result.current.tokens).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      await settle();
      expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
      expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C8"]);
    });

    it("keeps the server's first frame on hydration, then paints the entry without asking", async () => {
      storeEntry("trending:", page([row(7)]), 30_000);
      const { wrapper } = setup();
      const frames: (string | null)[][] = [];
      const { result } = renderHook(
        () => {
          const board = useTrendingBoard({ query: "", view: "all" });
          frames.push(board.tokens.map((t) => t.symbol));
          return board;
        },
        { wrapper, hydrate: true }
      );
      await settle();
      expect(frames[0]).toEqual([]);
      expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C7"]);
      expect(api.fetchTrendingBoard).not.toHaveBeenCalled();
    });
  });
});

describe("useScreenerCatalog", () => {
  it("makes no request and reports no loading while disabled", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useScreenerCatalog({ query: "", view: "curated", enabled: false }),
      { wrapper }
    );
    await settle();
    expect(api.fetchScreenerPage).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tokens).toEqual([]);
    expect(result.current.total).toBeNull();
  });

  it("walks the filtered pages with the same query, and hands back the catalogue's shape", async () => {
    api.fetchScreenerPage.mockImplementation(async (n: number) =>
      page([row(n)], { page: n, limit: 1, total: 2 })
    );
    const { wrapper } = setup();
    const query = "maxMarketCapUsd=1000000";
    const { result } = renderHook(() => useScreenerCatalog({ query, view: "all", enabled: true }), {
      wrapper,
    });
    expect(result.current.isLoading).toBe(true);
    await settle();
    expect(api.fetchScreenerPage).toHaveBeenLastCalledWith(1, query);
    expect(result.current).toMatchObject({ total: 2, loaded: 1, shownCount: 1, hasMore: true });
    await act(async () => {
      result.current.loadMore();
    });
    await settle();
    expect(api.fetchScreenerPage).toHaveBeenLastCalledWith(2, query);
    expect(result.current).toMatchObject({ loaded: 2, hasMore: false, loadMoreFailed: false });
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C1", "C2"]);
    // Both pages are kept for the session.
    const entry = stored(`list:${query}`)?.data as { pages: unknown[]; pageParams: number[] };
    expect(entry.pageParams).toEqual([1, 2]);
    expect(entry.pages).toHaveLength(2);
  });

  it("applies the view over what it holds, without asking again", async () => {
    api.fetchScreenerPage.mockResolvedValue(page([row(1), row(2, { riskLevel: "HIGH" })]));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ view }: { view: "curated" | "all" }) =>
        useScreenerCatalog({ query: "sortBy=age&sortOrder=asc", view, enabled: true }),
      { wrapper, initialProps: { view: "curated" } }
    );
    await settle();
    expect(result.current.shownCount).toBe(1);
    rerender({ view: "all" });
    await settle();
    expect(result.current.shownCount).toBe(2);
    expect(api.fetchScreenerPage).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure as an error with no tokens", async () => {
    const failure = new TradeApiError("SERVICE_UNAVAILABLE", "down", 503);
    api.fetchScreenerPage.mockRejectedValue(failure);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useScreenerCatalog({ query: "sortBy=age&sortOrder=asc", view: "all", enabled: true }),
      { wrapper }
    );
    await settle();
    expect(result.current.error).toBe(failure);
    expect(result.current.tokens).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("paints the stored pages of a recent session without asking", async () => {
    const query = "minLiquidityUsd=100000";
    storeEntry(`list:${query}`, { pages: [page([row(3), row(4)])], pageParams: [1] }, 10_000);
    const { wrapper } = setup();
    const { result } = renderHook(() => useScreenerCatalog({ query, view: "all", enabled: true }), {
      wrapper,
    });
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["C3", "C4"]);
    expect(result.current.isLoading).toBe(false);
    await settle();
    expect(api.fetchScreenerPage).not.toHaveBeenCalled();
  });
});

describe("useMemeScreener", () => {
  function serveBoth(trending: MemeToken[] = [row(1)], list: MemeToken[] = [row(2)]) {
    api.fetchTrendingBoard.mockImplementation(async () => page(trending));
    api.fetchScreenerPage.mockImplementation(async () => page(list));
  }

  function mount(trendingPageSize = 5) {
    const { wrapper } = setup();
    return renderHook(() => useMemeScreener({ view: "all", trendingPageSize }), { wrapper });
  }

  it("starts inactive: trending unfiltered, and no list request", async () => {
    serveBoth();
    const { result } = mount();
    await settle();
    expect(result.current).toMatchObject({
      timeframe: "24h",
      active: false,
      count: 0,
      preset: null,
      listQuery: "",
    });
    expect(result.current.filters).toEqual({ bounds: {}, sort: null });
    expect(api.fetchScreenerPage).not.toHaveBeenCalled();
    expect(api.fetchTrendingBoard).toHaveBeenCalledWith("");
    expect(result.current.list.isLoading).toBe(false);
    expect(result.current.trending.filtered).toBe(false);
  });

  it("asks for nothing while disabled, even with filters applied, and asks once enabled", async () => {
    serveBoth();
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ enabled }) => useMemeScreener({ view: "all", trendingPageSize: 5, enabled }),
      { wrapper, initialProps: { enabled: false } }
    );
    await settle();
    act(() => result.current.apply({ liquidity: { min: "10000" } }));
    await advance(TRENDING_REFRESH_MS * 2);
    expect(api.fetchTrendingBoard).not.toHaveBeenCalled();
    expect(api.fetchScreenerPage).not.toHaveBeenCalled();
    expect(result.current.trending.isLoading).toBe(false);
    expect(result.current.list.isLoading).toBe(false);

    rerender({ enabled: true });
    await settle();
    expect(api.fetchTrendingBoard).toHaveBeenCalledWith("minLiquidityUsd=10000");
    expect(api.fetchScreenerPage).toHaveBeenCalledWith(1, "minLiquidityUsd=10000");
  });

  it("sends a sort to the list only, leaving trending unfiltered and unasked", async () => {
    serveBoth();
    const { result } = mount();
    await settle();
    act(() => result.current.setSort({ by: "volume", order: "desc" }));
    await settle();
    expect(result.current.listQuery).toBe("sortBy=volume&sortOrder=desc&timeframe=24h");
    expect(api.fetchScreenerPage).toHaveBeenCalledWith(
      1,
      "sortBy=volume&sortOrder=desc&timeframe=24h"
    );
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
    expect(result.current.trending.filtered).toBe(false);
    expect(result.current.list.tokens.map((t) => t.symbol)).toEqual(["C2"]);

    act(() => result.current.apply({ liquidity: { min: "10000" } }));
    await settle();
    // The sort survives an apply, and trending gets the bounds but never the sort.
    expect(result.current.filters.sort).toEqual({ by: "volume", order: "desc" });
    expect(api.fetchTrendingBoard).toHaveBeenLastCalledWith("minLiquidityUsd=10000");
    expect(api.fetchScreenerPage).toHaveBeenLastCalledWith(
      1,
      "minLiquidityUsd=10000&sortBy=volume&sortOrder=desc&timeframe=24h"
    );
    expect(result.current.trending.filtered).toBe(true);
  });

  it("does not ask again when a timeframe change leaves both queries the same", async () => {
    serveBoth();
    const { result } = mount();
    act(() => result.current.apply({ marketCap: { max: "1000000" } }));
    await settle();
    const listCalls = api.fetchScreenerPage.mock.calls.length;
    const trendingCalls = api.fetchTrendingBoard.mock.calls.length;
    const resetKey = result.current.resetKey;

    act(() => result.current.setTimeframe("1h"));
    await settle();
    expect(result.current.timeframe).toBe("1h");
    expect(result.current.listQuery).toBe("maxMarketCapUsd=1000000");
    expect(result.current.resetKey).toBe(resetKey);
    expect(api.fetchScreenerPage).toHaveBeenCalledTimes(listCalls);
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(trendingCalls);
  });

  it("asks again when the timeframe scopes an applied bound", async () => {
    serveBoth();
    const { result } = mount();
    act(() => result.current.apply({ volume: { min: "5000" } }));
    await settle();
    const resetKey = result.current.resetKey;
    act(() => result.current.setTimeframe("1h"));
    await settle();
    expect(api.fetchScreenerPage).toHaveBeenLastCalledWith(1, "minVolumeUsd=5000&timeframe=1h");
    expect(api.fetchTrendingBoard).toHaveBeenLastCalledWith("minVolumeUsd=5000&timeframe=1h");
    expect(result.current.resetKey).not.toBe(resetKey);
  });

  it("does not ask again when the view switches", async () => {
    serveBoth([row(1), row(3, { riskLevel: "HIGH" })], [row(2), row(4, { riskLevel: "HIGH" })]);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ view }: { view: "curated" | "all" }) => useMemeScreener({ view, trendingPageSize: 5 }),
      { wrapper, initialProps: { view: "all" } }
    );
    act(() => result.current.setSort({ by: "age", order: "asc" }));
    await settle();
    expect(result.current.list.tokens).toHaveLength(2);
    expect(result.current.trending.tokens).toHaveLength(2);
    rerender({ view: "curated" });
    await settle();
    expect(result.current.list.tokens).toHaveLength(1);
    expect(result.current.trending.tokens).toHaveLength(1);
    expect(api.fetchScreenerPage).toHaveBeenCalledTimes(1);
    expect(api.fetchTrendingBoard).toHaveBeenCalledTimes(1);
  });

  it("edits the applied filters the way each control means", async () => {
    serveBoth();
    const { result } = mount();

    act(() => result.current.applyPreset("fresh"));
    const fresh = SCREENER_PRESETS.find((p) => p.id === "fresh");
    expect(result.current.filters).toEqual(fresh?.filters);
    // A copy, so a later edit can never reach the shared preset.
    expect(result.current.filters).not.toBe(fresh?.filters);
    expect(result.current.filters.bounds.age).not.toBe(fresh?.filters.bounds.age);
    expect(Object.isFrozen(result.current.filters)).toBe(false);
    expect(result.current).toMatchObject({ preset: "fresh", active: true, count: 2 });

    act(() => result.current.setSort({ by: "traders", order: "desc" }));
    expect(result.current.filters).toEqual({
      bounds: { age: { max: "60" } },
      sort: { by: "traders", order: "desc" },
    });
    expect(result.current.preset).toBeNull();

    act(() => result.current.apply({ price: { min: "1", max: "2" }, age: { max: "60" } }));
    expect(result.current.count).toBe(4);
    act(() => result.current.clearBound("price", "min"));
    expect(result.current.filters.bounds.price).toEqual({ max: "2" });
    act(() => result.current.clearBound("price", "max"));
    expect(result.current.filters.bounds).toEqual({ age: { max: "60" } });
    expect("price" in result.current.filters.bounds).toBe(false);

    act(() => result.current.clearAll());
    expect(result.current.filters).toEqual({ bounds: {}, sort: null });
    expect(result.current.active).toBe(false);
    expect(Object.isFrozen(result.current.filters)).toBe(false);
  });

  it("mirrors the controls to sessionStorage", () => {
    serveBoth();
    const { result } = mount();
    act(() => result.current.setTimeframe("6h"));
    act(() => result.current.apply({ traders: { min: "10" } }));
    expect(stored("ui")?.data).toEqual({
      timeframe: "6h",
      filters: { bounds: { traders: { min: "10" } }, sort: null },
    });
  });

  it("restores the stored controls after the server's first frame", async () => {
    serveBoth();
    const filters: ScreenerFilters = { bounds: { volume: { min: "5000" } }, sort: null };
    storeEntry("ui", { timeframe: "1h", filters }, 60 * 60_000);
    const { wrapper } = setup();
    const frames: string[] = [];
    const { result } = renderHook(
      () => {
        const screener = useMemeScreener({ view: "all", trendingPageSize: 5 });
        frames.push(`${screener.timeframe}|${screener.listQuery}`);
        return screener;
      },
      { wrapper, hydrate: true }
    );
    await settle();
    expect(frames[0]).toBe("24h|");
    expect(result.current.timeframe).toBe("1h");
    expect(result.current.filters).toEqual(filters);
    expect(result.current.listQuery).toBe("minVolumeUsd=5000&timeframe=1h");
    expect(api.fetchScreenerPage).toHaveBeenCalledWith(1, "minVolumeUsd=5000&timeframe=1h");
  });

  it.each([
    ["an unknown timeframe", { timeframe: "2h", filters: { bounds: {}, sort: null } }],
    [
      "a bound that is not canonical",
      { timeframe: "1h", filters: { bounds: { volume: { min: "5k" } }, sort: null } },
    ],
    [
      "a min above its max",
      { timeframe: "1h", filters: { bounds: { price: { min: "2", max: "1" } }, sort: null } },
    ],
    [
      "an unknown sort",
      { timeframe: "1h", filters: { bounds: {}, sort: { by: "hype", order: "desc" } } },
    ],
    ["a bare value", "1h"],
  ])("ignores stored controls with %s", async (_label, data) => {
    serveBoth();
    storeEntry("ui", data, 1_000);
    const { result } = mount();
    await settle();
    expect(result.current.timeframe).toBe("24h");
    expect(result.current.filters).toEqual({ bounds: {}, sort: null });
    expect(api.fetchScreenerPage).not.toHaveBeenCalled();
  });

  it("pages trending, clamps the page, and goes back to page 1 when its query changes", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => row(i + 1));
    serveBoth(twelve);
    const { result } = mount(5);
    await settle();
    expect(result.current.trending).toMatchObject({ page: 1, pages: 3 });
    expect(result.current.trending.pageTokens.map((t) => t.symbol)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ]);

    act(() => result.current.trending.setPage(3));
    expect(result.current.trending.page).toBe(3);
    expect(result.current.trending.pageTokens.map((t) => t.symbol)).toEqual(["C11", "C12"]);
    act(() => result.current.trending.setPage(9));
    expect(result.current.trending.page).toBe(3);
    act(() => result.current.trending.setPage(0));
    expect(result.current.trending.page).toBe(1);

    // A sort leaves trending's query alone, so the page is kept.
    act(() => result.current.trending.setPage(2));
    act(() => result.current.setSort({ by: "age", order: "asc" }));
    await settle();
    expect(result.current.trending.page).toBe(2);

    // A bound changes it: back to page 1, even though the new board is as long.
    act(() => result.current.apply({ liquidity: { min: "1" } }));
    await settle();
    expect(api.fetchTrendingBoard).toHaveBeenLastCalledWith("minLiquidityUsd=1");
    expect(result.current.trending).toMatchObject({ page: 1, pages: 3 });
    expect(result.current.trending.pageTokens.map((t) => t.symbol)[0]).toBe("C1");
  });

  it("clamps a held page when the board shrinks under it", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => row(i + 1));
    api.fetchTrendingBoard.mockResolvedValueOnce(page(twelve));
    api.fetchTrendingBoard.mockResolvedValueOnce(page(twelve.slice(0, 6)));
    const { result } = mount(5);
    await settle();
    act(() => result.current.trending.setPage(3));
    await advance(TRENDING_REFRESH_MS);
    await settle();
    expect(result.current.trending).toMatchObject({ page: 2, pages: 2 });
    expect(result.current.trending.pageTokens.map((t) => t.symbol)).toEqual(["C6"]);
  });

  it("reports one page and no tokens while trending has nothing", async () => {
    api.fetchTrendingBoard.mockRejectedValue(new TradeApiError("PROVIDER_ERROR", "down", 502));
    const { result } = mount(5);
    await settle();
    expect(result.current.trending).toMatchObject({ page: 1, pages: 1, pageTokens: [] });
    expect(result.current.trending.error).toBeInstanceOf(TradeApiError);
  });
});
