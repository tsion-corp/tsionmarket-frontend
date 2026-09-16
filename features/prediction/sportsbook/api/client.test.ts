import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/privy-token", () => ({
  resolveAuthTokens: async () => ({ accessToken: null, idToken: null }),
}));

import { getSportsbookBoard, MARKETS_BATCH_SIZE } from "./client";

// The provider prices a game's markets one game at a time, and asking for a
// whole board at once took 83 s for 24 games on staging, past the proxy's
// 45 s limit, so the board never loaded. Small batches in parallel finish in
// the time of the slowest batch.

const fetchMock = vi.fn();

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}

const eventIds = Array.from({ length: 10 }, (_, i) => `100${i}`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/sportsbook/events?")) {
      return ok({ events: eventIds.map((id) => ({ id, title: `Game ${id}` })), total: 10 });
    }
    if (url === "/api/sportsbook/events/markets") {
      const { gameIds } = JSON.parse(String(init?.body)) as { gameIds: string[] };
      return ok(gameIds.map((id) => ({ id: `m-${id}`, eventId: id, title: "Full Time Result" })));
    }
    throw new Error(`unexpected ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("getSportsbookBoard", () => {
  it("asks for the odds in small batches, all at once, and puts each market on its game", async () => {
    const board = await getSportsbookBoard({ sport: "football", state: "prematch" });

    const batches = fetchMock.mock.calls
      .filter(([url]) => url === "/api/sportsbook/events/markets")
      .map(([, init]) => (JSON.parse(String(init.body)) as { gameIds: string[] }).gameIds);
    expect(batches.every((ids) => ids.length <= MARKETS_BATCH_SIZE)).toBe(true);
    expect(batches.flat()).toEqual(eventIds);

    expect(board.events.map((event) => event.markets.map((m) => m.id))).toEqual(
      eventIds.map((id) => [`m-${id}`])
    );
  });

  it("fails the board when a batch fails, rather than showing games without odds as if they had none", async () => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/sportsbook/events/markets" && String(init?.body).includes("1004")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "SERVICE_UNAVAILABLE", message: "down" },
          }),
          { status: 502 }
        );
      }
      return base(url, init);
    });
    await expect(getSportsbookBoard({ sport: "football", state: "prematch" })).rejects.toThrow();
  });
});
