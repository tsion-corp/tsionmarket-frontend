import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The catalogue's own fetcher is the seam: the hook is under test, not the
// transport. A rejection here is what a failed page looks like to the query.
const fetchTokenCatalogPage = vi.fn();
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchTokenCatalogPage: (page: number, chain?: string) => fetchTokenCatalogPage(page, chain),
}));

const { useMemeCatalog, __setCatalogSessionStorageForTests } =
  await import("@/features/trade/hooks/use-meme-tokens");

// sessionStorage does not exist in this environment, and the point of the test
// is that the entry survives a fresh tab, so the store is held here by hand.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

let storage: Storage;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PAGE = {
  items: [
    {
      chainId: 8453,
      address: "0xabc",
      name: "Wrapped Ark",
      symbol: "WARK",
      decimals: 18,
      priceUsd: "1.5",
      buyEnabled: true,
    },
  ],
  meta: { page: 1, limit: 20, total: 1 },
};

beforeEach(() => {
  storage = memoryStorage();
  __setCatalogSessionStorageForTests(storage);
  fetchTokenCatalogPage.mockReset();
});

afterEach(() => {
  __setCatalogSessionStorageForTests(undefined);
});

describe("the memecoin catalogue's session cache", () => {
  // The trending strip has seeded itself from sessionStorage since the screener
  // shipped; the catalogue never did. So a single failed first page left the
  // desk with no rows and no cache to fall back on, and the list went to
  // "Memecoin markets are unavailable" while the strip beside it, holding its
  // own seed, carried on as though nothing were wrong.
  it("keeps the first page so a later tab does not start empty", async () => {
    fetchTokenCatalogPage.mockResolvedValue(PAGE);
    const first = renderHook(() => useMemeCatalog(), { wrapper });
    await waitFor(() => expect(first.result.current.tokens.length).toBe(1));

    // A fresh tab: new QueryClient, nothing in memory, the same storage, and
    // a service that is now refusing every request.
    fetchTokenCatalogPage.mockRejectedValue(new Error("Can't reach the server right now"));
    const second = renderHook(() => useMemeCatalog(), { wrapper });

    // The seed fills the rows before anything is asked of the network.
    expect(second.result.current.tokens.length).toBe(1);
    expect(second.result.current.tokens[0].symbol).toBe("WARK");

    // And a refresh that fails does not take them away again: the desk keeps
    // showing the last good catalogue instead of an empty panel.
    await second.result.current.refetch();
    await waitFor(() => expect(second.result.current.error).toBeTruthy());
    expect(second.result.current.tokens.length).toBe(1);
  });

  it("asks for nothing when the seed is already in hand", async () => {
    fetchTokenCatalogPage.mockResolvedValue(PAGE);
    const first = renderHook(() => useMemeCatalog(), { wrapper });
    await waitFor(() => expect(first.result.current.tokens.length).toBe(1));
    const asked = fetchTokenCatalogPage.mock.calls.length;

    const second = renderHook(() => useMemeCatalog(), { wrapper });
    await waitFor(() => expect(second.result.current.tokens.length).toBe(1));

    // The seed satisfies the first frame; a background refresh may still run,
    // but the seeded mount must not have blocked on one.
    expect(second.result.current.isLoading).toBe(false);
    expect(fetchTokenCatalogPage.mock.calls.length).toBeGreaterThanOrEqual(asked);
  });

  it("starts empty when storage holds nothing", async () => {
    fetchTokenCatalogPage.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useMemeCatalog(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.tokens).toEqual([]);
  });
});
