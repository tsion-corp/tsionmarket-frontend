import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchPoolCandles } = await import("@/lib/server/geckoterminal");

// GeckoTerminal answers newest-first, in six-element arrays, and the chart
// library throws on an out-of-order or repeated timestamp rather than skipping
// it — a blank sheet, not a gap. Everything here is about the shape of that
// translation, because every part of it fails silently or fatally, never
// visibly.

const POOL = "0xdfc3d7971c3fbaf4f3fc4303614b0bb7fa35588b";
const TOKEN = "0x637e2ac15bf8782159d5841914c3cc8b95431522";

function respond(ohlcv: number[][]) {
  return {
    ok: true,
    json: async () => ({ data: { attributes: { ohlcv_list: ohlcv } } }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchPoolCandles", () => {
  // The upstream returns descending. Handing that straight to the chart is the
  // whole series drawn backwards, or an exception, depending on the library's
  // mood — so the order is reversed here rather than trusted.
  it("turns the newest-first upstream into an ascending series", async () => {
    fetchMock.mockResolvedValue(
      respond([
        [1790780400, 3, 4, 2, 3.5, 100],
        [1790776800, 1, 2, 0.5, 1.5, 50],
      ])
    );

    const points = await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    expect(points?.map((p) => p.time)).toEqual([1790776800, 1790780400]);
  });

  // A duplicate timestamp makes the chart library throw outright, which blanks
  // the sheet rather than dropping a point.
  it("keeps one point per timestamp", async () => {
    fetchMock.mockResolvedValue(
      respond([
        [1790780400, 3, 4, 2, 3.5, 100],
        [1790780400, 9, 9, 9, 9, 9],
        [1790776800, 1, 2, 0.5, 1.5, 50],
      ])
    );

    const points = await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    expect(points).toHaveLength(2);
    expect(new Set(points?.map((p) => p.time)).size).toBe(2);
  });

  // An area chart draws where each interval ENDED. Reading the open instead
  // shifts the whole line one interval into the past, which looks entirely
  // plausible and is wrong.
  it("draws the close, not the open", async () => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    const points = await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    expect(points).toEqual([{ time: 1790776800, value: 1.5 }]);
  });

  it("maps a candle series to open, high, low and close", async () => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    const points = await fetchPoolCandles("base", POOL, TOKEN, "7", "candles");

    expect(points).toEqual([{ time: 1790776800, open: 1, high: 2, low: 0.5, close: 1.5 }]);
  });

  // The token is not decoration on the request. A pool has two sides and the
  // desk's pairAddress may hold this token as the quote; without naming it the
  // upstream charts the other asset's price under this token's name.
  it("names the token being charted, and asks in dollars", async () => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("token")).toBe(TOKEN);
    expect(url.searchParams.get("currency")).toBe("usd");
    expect(url.pathname).toContain(`/networks/base/pools/${POOL}/ohlcv/`);
  });

  // The upstream rejects any aggregate it did not name for a timeframe — day
  // takes only 1, hour takes 1/4/12, minute takes 1/5/15 — and a 400 here is a
  // chart that never draws.
  it.each([
    ["1", "minute", "15"],
    ["7", "hour", "1"],
    ["30", "hour", "12"],
    ["365", "day", "1"],
    ["max", "day", "1"],
  ])("asks for a window the upstream accepts at %s days", async (days, timeframe, aggregate) => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    await fetchPoolCandles("base", POOL, TOKEN, days, "area");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain(`/ohlcv/${timeframe}`);
    expect(url.searchParams.get("aggregate")).toBe(aggregate);
    expect(Number(url.searchParams.get("limit"))).toBeLessThanOrEqual(1000);
  });

  it("maps Solana to its own network rather than guessing", async () => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    await fetchPoolCandles("solana", "5zpyutJu9ee", "DezXAZ8z7Pn", "7", "area");

    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toContain("/networks/solana/");
  });

  // Null, not an empty array: the caller decides whether to try another source,
  // and the two read the same on the screen otherwise.
  it("answers null for a chain it cannot address, without asking", async () => {
    expect(await fetchPoolCandles("dogechain", POOL, TOKEN, "7", "area")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers null when the pool has no candles yet", async () => {
    fetchMock.mockResolvedValue(respond([]));

    expect(await fetchPoolCandles("base", POOL, TOKEN, "7", "area")).toBeNull();
  });

  // Roughly one row in twelve names a pool the upstream has never indexed —
  // WETH, live, whose stored pair 404s here while twenty other pools for it
  // exist. Giving up there is a blank chart for a token with $161m of
  // liquidity behind it.
  it("asks the token for its own pool when the stored one is unknown", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ attributes: { address: "0xdeeper" } }] }),
      } as unknown as Response)
      .mockResolvedValueOnce(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    const points = await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    expect(points).toEqual([{ time: 1790776800, value: 1.5 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/tokens/${TOKEN}/pools`);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/pools/0xdeeper/ohlcv/");
  });

  // The discovery call is the one the old note warns about. It must not run
  // when the pool we were handed already worked, or every chart costs two.
  it("does not go looking when the stored pool answers", async () => {
    fetchMock.mockResolvedValue(respond([[1790776800, 1, 2, 0.5, 1.5, 50]]));

    await fetchPoolCandles("base", POOL, TOKEN, "7", "area");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Retrying the same address is a wasted call against a ten-a-minute budget.
  it("does not retry the pool it was already given", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ attributes: { address: POOL.toUpperCase() } }] }),
      } as unknown as Response);

    expect(await fetchPoolCandles("base", POOL, TOKEN, "7", "area")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers null when the upstream refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as unknown as Response);

    expect(await fetchPoolCandles("base", POOL, TOKEN, "7", "area")).toBeNull();
  });
});
