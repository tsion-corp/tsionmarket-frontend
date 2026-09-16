import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memeToken } from "@/features/trade/lib/meme-fixture";

// The contract's detail-route semantics for Solana: 502 PROVIDER_ERROR means
// every RPC provider was unavailable, so retry with exponential backoff and
// show a temporary state; 404 TOKEN_NOT_FOUND is a confirmed absence. Neither
// is stored as a token that does not exist.

const api = vi.hoisted(() => ({ fetchToken: vi.fn(), fetchTokenCatalogPage: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchToken: api.fetchToken,
  fetchTokenCatalogPage: api.fetchTokenCatalogPage,
}));

import { TradeApiError } from "@/lib/meme/api";
import {
  __setCatalogSessionStorageForTests,
  useMemeCatalog,
  useMemeToken,
} from "@/features/trade/hooks/use-meme-tokens";

const MINT = { address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp", chainId: 101 };
const providerError = () => new TradeApiError("PROVIDER_ERROR", "rpc down", 502, "req-502");
const notFound = () => new TradeApiError("TOKEN_NOT_FOUND", "absent", 404, "req-404");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
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

// These cases are about how the catalogue pages, not about its session cache,
// and a seeded first page would satisfy page 1 without asking for it. Run them
// in a tab with no storage at all, so every page is a real request.
beforeEach(() => __setCatalogSessionStorageForTests(null));
afterEach(() => __setCatalogSessionStorageForTests(undefined));

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchToken.mockReset();
  api.fetchTokenCatalogPage.mockReset();
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
    // No fifth retry (and still short of the 30 s poll).
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

// Slice 4: the catalogue is paged per the contract, "until page * limit >=
// total", a page of 500 at a time, the next one only when asked for. The count
// is the server's total; what the discovery view keeps is shownCount.
describe("useMemeCatalog walks the catalogue a page at a time", () => {
  const LIMIT = 500;
  const TOTAL = 1_200; // three pages of 500
  const row = (n: number, extra: Parameters<typeof memeToken>[0] = {}) =>
    memeToken({ symbol: `C${n}`, address: `0x${String(n).padStart(40, "0")}`, ...extra });

  function servePages() {
    api.fetchTokenCatalogPage.mockImplementation(async (page: number) => {
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

  it("fetches page 1 only, and reports the server's total", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog(), { wrapper });
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(1);
    expect(api.fetchTokenCatalogPage).toHaveBeenLastCalledWith(1, undefined);
    expect(result.current.total).toBe(TOTAL);
    expect(result.current.loaded).toBe(500);
    expect(result.current.hasMore).toBe(true);
    // The default view is All, so all 500 rows of page 1 are listed. The
    // curated case is the test below.
    expect(result.current.shownCount).toBe(500);
    expect(result.current.tokens).toHaveLength(500);
  });

  it("loads page 2 and appends it without a duplicate row", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await settle();
    await act(async () => {
      result.current.loadMore();
    });
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenLastCalledWith(2, undefined);
    const keys = result.current.tokens.map((t) => `${t.chainId}:${t.address}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.current.loaded).toBe(1_000);
    expect(result.current.tokens).toHaveLength(1_000);
  });

  it("stops at page * limit >= total and never asks for a fourth page", async () => {
    servePages();
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper });
    await settle();
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        result.current.loadMore();
      });
      await settle();
    }
    expect(api.fetchTokenCatalogPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loaded).toBe(TOTAL);
    expect(result.current.total).toBe(TOTAL);
  });

  it("switches views over the pages it holds, without asking again", async () => {
    servePages();
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ view }: { view: "curated" | "all" }) => useMemeCatalog({ view }),
      { wrapper, initialProps: { view: "curated" } }
    );
    await settle();
    expect(result.current.shownCount).toBe(450);
    rerender({ view: "all" });
    await settle();
    expect(result.current.shownCount).toBe(500);
    expect(result.current.total).toBe(TOTAL);
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(1);
  });

  it("scopes every page to the chain it was given", async () => {
    servePages();
    const { wrapper } = setup();
    renderHook(() => useMemeCatalog({ chain: "base" }), { wrapper });
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenLastCalledWith(1, "base");
  });
});
