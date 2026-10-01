import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The chart went blank whenever CoinGecko throttled the request, because it was
// the only source and the route reported its refusal as the end of the matter.
// The key raises the ceiling; the DefiLlama fallback means one refusal is no
// longer the whole answer.

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/chart/route";

const COINGECKO_BODY = {
  prices: [
    [1_700_000_000_000, 0.1],
    [1_700_003_600_000, 0.11],
  ],
};

const LLAMA_BODY = {
  coins: {
    "coingecko:dogecoin": {
      symbol: "DOGE",
      prices: [
        { timestamp: 1_700_000_000, price: 0.2 },
        { timestamp: 1_700_003_600, price: 0.21 },
      ],
    },
  },
};

function req(params: string) {
  return new NextRequest(`https://example.test/api/chart?${params}`);
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 429,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("COINGECKO_API_KEY", "CG-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/chart", () => {
  it("sends the demo key as a header, never in the URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(COINGECKO_BODY));
    await GET(req("id=dogecoin&days=30"));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("CG-test-key");
    expect(new Headers(init.headers).get("x-cg-demo-api-key")).toBe("CG-test-key");
  });

  it("falls back to DefiLlama when CoinGecko refuses", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, false))
      .mockResolvedValueOnce(jsonResponse(LLAMA_BODY));

    const res = await GET(req("id=dogecoin&days=30"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.points[0]).toEqual({ time: 1_700_000_000, value: 0.2 });
  });

  it("falls back when CoinGecko answers with no points at all", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ prices: [] }))
      .mockResolvedValueOnce(jsonResponse(LLAMA_BODY));

    const res = await GET(req("id=dogecoin&days=30"));
    const body = await res.json();
    expect(body.points).toHaveLength(2);
  });

  it("prefers CoinGecko when it answers", async () => {
    fetchMock.mockResolvedValue(jsonResponse(COINGECKO_BODY));

    const res = await GET(req("id=dogecoin&days=30"));
    const body = await res.json();
    expect(body.points[0]).toEqual({ time: 1_700_000_000, value: 0.1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // DefiLlama serves prices, not candles. Standing in for a candle chart would
  // mean inventing the open, high and low from a single price.
  it("does not fall back for a candle chart", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, false));

    const res = await GET(req("id=dogecoin&days=30&type=candles"));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an error when both sources fail", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, false))
      .mockResolvedValueOnce(jsonResponse({ coins: {} }));

    const res = await GET(req("id=dogecoin&days=30"));
    expect(res.status).toBe(502);
  });
});

// A pool is what a token that no exchange has listed still has. Roughly a third
// of the meme desk's rows are in that state, so this is the branch that decides
// whether they chart at all — and the order matters: the pool is asked first,
// because a token CAN be both listed and pooled, and the pool is the one that
// is always current.
describe("GET /api/chart from a pool", () => {
  const POOL_BODY = {
    data: {
      attributes: {
        ohlcv_list: [
          [1_700_003_600, 3, 4, 2, 3.5, 100],
          [1_700_000_000, 1, 2, 0.5, 1.5, 50],
        ],
      },
    },
  };
  const POOL = "chain=base&pool=0xpool&token=0xtoken";

  it("charts the pool, ascending, without touching a listing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(POOL_BODY));

    const res = await GET(req(`${POOL}&days=7`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.points).toEqual([
      { time: 1_700_000_000, value: 1.5 },
      { time: 1_700_003_600, value: 3.5 },
    ]);
    // One call: the stored pool answered, so nothing went looking for another.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("geckoterminal");
  });

  // The pool is preferred, not exclusive. A token with both keeps the listing
  // as a second answer rather than failing when its pool has nothing yet.
  it("falls back to the listing when the pool has nothing", async () => {
    fetchMock
      // The stored pool, empty.
      .mockResolvedValueOnce(jsonResponse({ data: { attributes: { ohlcv_list: [] } } }))
      // The token's own pools, also nothing to offer.
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse(COINGECKO_BODY));

    const res = await GET(req(`${POOL}&id=dogecoin&days=7`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.points[0]).toEqual({ time: 1_700_000_000, value: 0.1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports an empty pool with no listing behind it, rather than hanging", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { attributes: { ohlcv_list: [] } } }));

    const res = await GET(req(`${POOL}&days=7`));

    expect(res.status).toBe(502);
  });

  // The keyless upstream allows roughly ten calls a minute shared by IP across
  // every reader, so the edge cache is not an optimisation here — it is what
  // makes the source usable at all. The failure branch carries it too, or a
  // token with no chart re-asks on every render.
  it("caches every answer at the edge, including the failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(POOL_BODY));
    const ok = await GET(req(`${POOL}&days=7`));
    expect(ok.headers.get("Cache-Control")).toContain("s-maxage=300");

    fetchMock.mockResolvedValue(jsonResponse({ data: { attributes: { ohlcv_list: [] } } }));
    const bad = await GET(req(`${POOL}&days=7`));
    expect(bad.status).toBe(502);
    expect(bad.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
});
