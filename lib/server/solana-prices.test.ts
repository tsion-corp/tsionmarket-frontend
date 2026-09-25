import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRCL = "4LLbsb5ReP3yEtYzmXewyGjcir5uXtKFURtaEUVC2AHs";
const THIN = "ThinPool1111111111111111111111111111111111";
const UNKNOWN = "Unknown11111111111111111111111111111111111";

describe("fetchSolanaMintPrices", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(async () => {
    const { resetResponseCache } = await import("./response-cache");
    resetResponseCache();
    vi.unstubAllGlobals();
  });

  it("prices the mints DefiLlama is confident about, and leaves the rest absent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(decodeURIComponent(url)).toContain(`solana:${PRCL}`);
      return new Response(
        JSON.stringify({
          coins: {
            [`solana:${PRCL}`]: { price: 0.0059, confidence: 0.99 },
            [`solana:${THIN}`]: { price: 12, confidence: 0.3 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchSolanaMintPrices } = await import("./solana-prices");

    const prices = await fetchSolanaMintPrices([PRCL, THIN, UNKNOWN, PRCL]);
    expect(prices.get(PRCL)).toBeCloseTo(0.0059);
    expect(prices.has(THIN)).toBe(false);
    expect(prices.has(UNKNOWN)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers nothing, rather than throwing, when the feed is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );
    const { fetchSolanaMintPrices } = await import("./solana-prices");
    expect((await fetchSolanaMintPrices([PRCL])).size).toBe(0);
  });

  it("asks nothing for an empty list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchSolanaMintPrices } = await import("./solana-prices");
    expect((await fetchSolanaMintPrices([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
