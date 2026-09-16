import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module reads its base URL once at import, so each case imports it fresh
// with the env already in place.
async function load() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_TRADE_API_URL = "https://trade.test";
  return import("@/lib/server/meme-positions");
}

const BEARER = "Bearer token";

function okResponse(items: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ data: { items, meta: { total: items.length } } }),
  } as unknown as Response;
}

function downResponse() {
  return { ok: false, status: 502, json: async () => ({}) } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The trade service went down on production on 2026-09-16 and every signed-in
// user's portfolio poll kept calling it: /api/portfolio degrades gracefully, so
// its own client breaker never opened, and each poll held a function waiting on
// a service that was not answering. The client breaker cannot see this call —
// it happens server-side — so the backoff has to live here.
describe("fetchMemePositions, when the trade service is down", () => {
  it("stops calling the service after repeated failures", async () => {
    const mod = await load();
    fetchMock.mockResolvedValue(downResponse());

    for (let i = 0; i < mod.TRADE_FAILURE_THRESHOLD; i += 1) {
      await mod.fetchMemePositions(BEARER);
    }
    const callsWhileLearning = fetchMock.mock.calls.length;
    expect(callsWhileLearning).toBe(mod.TRADE_FAILURE_THRESHOLD);

    // The next poll must cost nothing: no request, no waiting on a timeout.
    const result = await mod.fetchMemePositions(BEARER);
    expect(fetchMock).toHaveBeenCalledTimes(callsWhileLearning);
    expect(result).toEqual({ buyable: {}, meme: {} });
  });

  it("asks again once the cooldown has passed", async () => {
    const mod = await load();
    fetchMock.mockResolvedValue(downResponse());
    for (let i = 0; i < mod.TRADE_FAILURE_THRESHOLD; i += 1) {
      await mod.fetchMemePositions(BEARER);
    }
    const parked = fetchMock.mock.calls.length;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + mod.TRADE_COOLDOWN_MS + 1);
    await mod.fetchMemePositions(BEARER);
    expect(fetchMock.mock.calls.length).toBe(parked + 1);
    vi.useRealTimers();
  });

  it("forgets the failures as soon as one call succeeds", async () => {
    const mod = await load();
    fetchMock.mockResolvedValue(downResponse());
    // One short of the threshold, then a good answer.
    for (let i = 0; i < mod.TRADE_FAILURE_THRESHOLD - 1; i += 1) {
      await mod.fetchMemePositions(BEARER);
    }
    fetchMock.mockResolvedValue(okResponse());
    await mod.fetchMemePositions(BEARER);

    // Back to zero: a later failure must not trip the breaker on its own.
    fetchMock.mockResolvedValue(downResponse());
    await mod.fetchMemePositions(BEARER);
    const before = fetchMock.mock.calls.length;
    await mod.fetchMemePositions(BEARER);
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });
});
