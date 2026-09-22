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
