import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memeToken } from "@/lib/meme/fixture";

// The catalogue's first page in sessionStorage, and the two things it must not
// cost us. It must not skip the read: our catalogue query never goes stale, so
// a stored page handed over as initialData would mean a reload paints an old
// list and never asks the service again. And it must not keep itself alive: a
// page written back under a fresh timestamp would be five minutes old forever.

const api = vi.hoisted(() => ({ fetchTokenCatalogPage: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchTokenCatalogPage: api.fetchTokenCatalogPage,
}));

import { useMemeCatalog } from "@/features/trade/hooks/use-meme-tokens";
import {
  CATALOG_SESSION_MAX_AGE_MS,
  __setCatalogSessionStorageForTests,
} from "@/features/trade/hooks/use-meme-catalog-session";

// jsdom under this Node build exposes no sessionStorage, and the point of the
// suite is an entry that outlives a tab, so the store is held here by hand.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

let storage: Storage;

// A whole catalogue in one page, so the walk finishes on the first answer and
// nothing else is in flight while the assertions run.
const page = (symbol: string) => ({
  items: [memeToken({ symbol, address: `0x${symbol}`, chainId: 8453 })],
  meta: { page: 1, limit: 500, total: 1 },
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
}

// TanStack delivers a settled state to observers on a zero-delay timer, so an
// assertion about what a hook reports needs the tick after the fetch settles.
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

// What storage holds for the unfiltered catalogue, as the cache wrote it.
function stored(): { v: number; savedAt: number; data: { items: { symbol: string }[] } } | null {
  const raw = storage.getItem("wsws.meme-catalog.catalog:all");
  return raw === null ? null : (JSON.parse(raw) as ReturnType<typeof stored>);
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = memoryStorage();
  __setCatalogSessionStorageForTests(storage);
  api.fetchTokenCatalogPage.mockReset();
});

afterEach(() => {
  __setCatalogSessionStorageForTests(undefined);
  vi.useRealTimers();
});

describe("the memecoin catalogue's session copy", () => {
  it("keeps the first page the service returned", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    expect(stored()?.data.items.map((row) => row.symbol)).toEqual(["HACHI"]);
  });

  it("shows the stored rows when the first page fails, instead of an empty list", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    // A new tab: a fresh QueryClient holding nothing, the same storage, and a
    // trade service that now refuses everything.
    api.fetchTokenCatalogPage.mockRejectedValue(new Error("Can't reach the server right now"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    expect(result.current.tokens.map((token) => token.symbol)).toEqual(["HACHI"]);
    // Not a skeleton either: there are rows, so the list is not loading.
    expect(result.current.isLoading).toBe(false);
    // The failure is still reported. The desk shows the rows under a line
    // saying the prices are stale; it is not swallowed to make the list look
    // healthy.
    expect(result.current.error).toBeTruthy();
  });

  it("still reads the service on a page load, so a reload is a real read", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(1);

    // The guarantee the localStorage snapshot was given up for: a seeded mount
    // paints at once and asks anyway. The catalogue query never goes stale, so
    // a copy handed over as initialData would have skipped this read entirely.
    api.fetchTokenCatalogPage.mockResolvedValue(page("BRETT"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    expect(api.fetchTokenCatalogPage).toHaveBeenCalledTimes(2);

    await settle();
    expect(result.current.tokens.map((token) => token.symbol)).toEqual(["BRETT"]);
  });

  it("ignores a copy older than five minutes", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();
    expect(stored()).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CATALOG_SESSION_MAX_AGE_MS + 1);
    });

    api.fetchTokenCatalogPage.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    expect(result.current.tokens).toEqual([]);
    expect(result.current.error).toBeTruthy();
    // An expired entry is dropped rather than left to be read again.
    expect(stored()).toBeNull();
  });

  it("never rewrites a copy it read, so a stale list cannot keep itself alive", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();
    const savedAt = stored()?.savedAt;
    expect(savedAt).toBeDefined();

    // Four minutes on, a tab opens against a service that is refusing. It
    // paints the copy, and must not touch its age.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    api.fetchTokenCatalogPage.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();
    expect(result.current.tokens).toHaveLength(1);
    expect(stored()?.savedAt).toBe(savedAt);

    // So it expires on time: a minute later it is past five minutes old and a
    // tab opening then starts empty rather than on a list from any age.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    const later = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();
    expect(later.result.current.tokens).toEqual([]);
  });

  it("starts empty when storage holds nothing", async () => {
    api.fetchTokenCatalogPage.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    expect(result.current.tokens).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it("works in a tab with no storage at all", async () => {
    __setCatalogSessionStorageForTests(null);
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    const { result } = renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    expect(result.current.tokens.map((token) => token.symbol)).toEqual(["HACHI"]);
  });

  it("keeps one copy per list, so a chain does not overwrite the catalogue", async () => {
    api.fetchTokenCatalogPage.mockResolvedValue(page("HACHI"));
    renderHook(() => useMemeCatalog({ view: "all" }), { wrapper: setup() });
    await settle();

    api.fetchTokenCatalogPage.mockResolvedValue(page("BRETT"));
    renderHook(() => useMemeCatalog({ view: "all", chain: "base" }), { wrapper: setup() });
    await settle();

    expect(stored()?.data.items.map((row) => row.symbol)).toEqual(["HACHI"]);
    expect(storage.getItem("wsws.meme-catalog.catalog:base")).not.toBeNull();
  });
});
