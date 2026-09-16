import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Alchemy holdings path allow-lists a held memecoin from the trade
// catalogue. It read page 1 of 100, so a coin bought from row 101 onward was
// not a holding. It now walks Base pages of 500 until the server's total,
// bounded at 20 pages and revalidated every ten minutes: a stopgap until the
// service's /portfolio is the source of truth (slice 5).

vi.mock("@/lib/server/dextopus", () => ({
  dextopusRequest: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
}));

const fetchMock = vi.fn();

function catalogPage(page: number, limit: number, total: number) {
  const start = (page - 1) * limit;
  const count = Math.max(0, Math.min(limit, total - start));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        items: Array.from({ length: count }, (_, i) => ({
          chainId: 8453,
          address: `0x${String(start + i).padStart(40, "0")}`,
          logoUrl: null,
          priceUsd: "0.5",
        })),
        meta: { page, limit, total },
      },
    }),
  };
}

function serve(total: number) {
  fetchMock.mockImplementation(async (url: string) => {
    const params = new URL(url).searchParams;
    return catalogPage(Number(params.get("page")), Number(params.get("limit")), total);
  });
}

const pagesAsked = () => fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get("page"));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

import { fetchBuyableRegistry } from "@/lib/server/buyable-registry";

describe("the trade catalogue in the buyable registry", () => {
  it("walks Base pages of 500 until the server's total, and stops there", async () => {
    serve(1_200);
    const { buyable, meme } = await fetchBuyableRegistry();
    expect(pagesAsked()).toEqual(["1", "2", "3"]);
    for (const [url, init] of fetchMock.mock.calls) {
      const params = new URL(url).searchParams;
      expect(params.get("limit")).toBe("500");
      expect(params.get("chain")).toBe("base");
      expect(init.next).toEqual({ revalidate: 600 });
    }
    expect(buyable["base-mainnet"]?.size).toBe(1_200);
    // A coin from the third page is a holding now, not just the first hundred.
    expect(buyable["base-mainnet"]?.has(`0x${String(1_150).padStart(40, "0")}`)).toBe(true);
    expect(meme["base-mainnet"]?.size).toBe(1_200);
  });

  it("stops at exactly page * limit === total, without a page past it", async () => {
    serve(1_000);
    await fetchBuyableRegistry();
    expect(pagesAsked()).toEqual(["1", "2"]);
  });

  it("never walks more than 20 pages, whatever the total says", async () => {
    serve(1_000_000);
    const { buyable } = await fetchBuyableRegistry();
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(buyable["base-mainnet"]?.size).toBe(10_000);
  });

  it("keeps the pages it already has when a later page fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      if (page === 2) return { ok: false, status: 502, json: async () => ({}) };
      return catalogPage(page, 500, 1_500);
    });
    const { buyable } = await fetchBuyableRegistry();
    expect(pagesAsked()).toEqual(["1", "2"]);
    expect(buyable["base-mainnet"]?.size).toBe(500);
    // Not silent: a short registry is logged.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// The contract: a null price means "not currently available", never zero. The
// registry stored 0 for it, and lib/server/alchemy then valued the holding at
// $0.00. It keeps the null now, so the holding reads unpriced.
describe("a catalogue row the market cannot price", () => {
  it("is stored with a null price, not 0", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          items: [
            {
              chainId: 8453,
              address: "0xAbC0000000000000000000000000000000000001",
              priceUsd: null,
            },
            {
              chainId: 8453,
              address: "0xabc0000000000000000000000000000000000002",
              priceUsd: "0.25",
            },
            {
              chainId: 8453,
              address: "0xabc0000000000000000000000000000000000003",
              priceUsd: "n/a",
            },
          ],
          meta: { page: 1, limit: 500, total: 3 },
        },
      }),
    });
    const { meme } = await fetchBuyableRegistry();
    const base = meme["base-mainnet"];
    expect(base?.get("0xabc0000000000000000000000000000000000001")?.priceUsd).toBeNull();
    expect(base?.get("0xabc0000000000000000000000000000000000002")?.priceUsd).toBe(0.25);
    // An unreadable price is not a price either.
    expect(base?.get("0xabc0000000000000000000000000000000000003")?.priceUsd).toBeNull();
  });
});
