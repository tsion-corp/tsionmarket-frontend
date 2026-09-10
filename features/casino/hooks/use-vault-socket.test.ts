// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import {
  handleVaultFrame,
  reconnectDelay,
  resetRevisionTracking,
} from "@/features/casino/hooks/use-vault-socket";
import {
  latestSettlement,
  resetSettlements,
} from "@/features/casino/lib/last-standing/settlements";

// The settle frame is how the lobby learns a payout landed; the balance card
// credits it from here.
describe("gameSettled frames", () => {
  beforeEach(() => resetSettlements());

  it("records the settlement for the balance card", () => {
    const client = new QueryClient();
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "gameSettled",
        topic: "vault:king-of-night",
        data: {
          gameId: 425,
          winner: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
          starter: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
          potWei: "201231206442684",
          toWinnerWei: "100615603221342",
          toStarterWei: "20123120644268",
          toTreasuryWei: "80492482577074",
          transactionHash: "0x5774d5c805e206bf70a3d4a09b69f17bf5261ce50564a8cc44349f8abb6cbbcc",
        },
      })
    );
    expect(latestSettlement()).toMatchObject({ gameId: 425, toWinnerWei: 100615603221342n });
  });
});

// Seen on 2026-09-10 walking from the lobby to a game page: the lobby's
// unmount closed socket A and the game page's mount opened socket B at once.
// A's close event then fired, cleared the shared reference (B's), and
// scheduled a reconnect that opened C. When B finally opened, its handler
// sent the subscribe frame through the shared reference, which was C, still
// connecting, and the browser threw "Still in CONNECTING state". B was then
// abandoned, open and receiving frames, beside C. Every handler must act on
// the socket it was attached to, and a closed socket must not touch the
// shared reference once it has been replaced.
describe("useVaultSocket across a remount", () => {
  class FakeSocket {
    static instances: FakeSocket[] = [];
    readyState = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public url: string) {
      FakeSocket.instances.push(this);
    }
    send(data: string) {
      if (this.readyState !== 1) throw new Error("Still in CONNECTING state");
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
    }
    // The browser's events, driven by the test in the order they really came.
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    closed() {
      this.readyState = 3;
      this.onclose?.();
    }
  }

  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_VAULT_WS_URL", "wss://hub.test/");
    vi.stubGlobal("WebSocket", Object.assign(FakeSocket, { OPEN: 1 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps one live connection and never sends on a socket still connecting", async () => {
    const { useVaultSocket } = await import("@/features/casino/hooks/use-vault-socket");
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    // The lobby mounts and its socket A opens.
    const lobby = renderHook(() => useVaultSocket(), { wrapper });
    const a = FakeSocket.instances[0];
    act(() => a.open());
    expect(a.sent).toHaveLength(1);

    // The lobby unmounts and the game page mounts in the same tick: A is
    // told to close, B is created and is still connecting.
    lobby.unmount();
    const page = renderHook(() => useVaultSocket(), { wrapper });
    const b = FakeSocket.instances[1];
    expect(b).toBeDefined();

    // A's close event arrives now, after B exists.
    act(() => a.closed());
    // Then B opens. This is the line that threw.
    expect(() => act(() => b.open())).not.toThrow();
    expect(b.sent).toHaveLength(1);
    expect(page.result.current).toBe(true);

    // No reconnect was scheduled for A: nothing else is created.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(FakeSocket.instances).toHaveLength(2);
    page.unmount();
  });
});

// A dead connection is retried at two seconds, then doubling, never more
// than half a minute apart: fast enough to catch a blip, slow enough not to
// drown a poor connection in attempts that cannot succeed.
describe("reconnectDelay", () => {
  it("doubles from two seconds and caps at thirty", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(reconnectDelay)).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });
});

// The production hub sends `{"type":"activeGames","data":{"games":{}}}`: an
// object where the contract says an array. Written into the cache as-is, the
// lobby's `games.map` threw and the whole page went to the error boundary.
// A frame is an upstream payload; it is validated at the boundary like any
// other, and a malformed one never reaches a component.
describe("activeGames frames", () => {
  const row = (gameId: number) => ({
    gameId,
    starter: "0xa",
    king: "0xa",
    pot: { amount: "1", tokenSymbol: "ETH", usdValue: 1, formattedUsd: "$1" },
    minWager: { amount: "1", tokenSymbol: "ETH", usdValue: 1, formattedUsd: "$1" },
    endTime: 1,
    timeRemaining: 0,
    settled: false,
    active: true,
  });

  it("replaces the lobby with a well-formed snapshot", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.games, [row(9)]);
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: [row(1)] } }));
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([row(1)]);
  });

  it("ignores a snapshot whose games is not an array, and keeps what it had", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.games, [{ gameId: "kept" }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: {} } }));
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: "no" } }));
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: null }));
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([{ gameId: "kept" }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // Captured from the production hub on 2026-09-09 during game 416. The hub
  // describes a game in the contract's shape, wei strings and all, which is
  // exactly what the chain reader produces. Those rows belong in the chain
  // games cache, where mergeGames prices them; dropping them left the lobby
  // saying "no games" from the socket and relying on the 8 s chain poll.
  const HUB_ROW = {
    minWagerWei: "200683125358721",
    endTime: 1788948057,
    king: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
    timeRemaining: 56,
    gameId: 416,
    active: true,
    starter: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
    potWei: "200683125358721",
    settled: false,
  };

  it("keeps the hub's contract-shaped rows as chain games", () => {
    const client = new QueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "activeGames",
        topic: "vault:king-of-night",
        data: { games: [HUB_ROW] },
        revision: 17181,
      })
    );
    expect(client.getQueryData(VAULT_KEYS.chainGames)).toEqual([
      {
        gameId: 416,
        starter: HUB_ROW.starter,
        king: HUB_ROW.king,
        potWei: 200683125358721n,
        minWagerWei: 200683125358721n,
        endTime: 1788948057,
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("an empty hub snapshot clears the chain games too", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.chainGames, [{ gameId: 415 }]);
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: [] } }));
    expect(client.getQueryData(VAULT_KEYS.chainGames)).toEqual([]);
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([]);
  });

  it("sorts each row into the cache its shape belongs to and drops the rest", () => {
    const client = new QueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "activeGames",
        data: { games: [HUB_ROW, row(2), { gameId: 3, potWei: "not-a-number" }] },
      })
    );
    expect(
      (client.getQueryData(VAULT_KEYS.games) as { gameId: number }[]).map((g) => g.gameId)
    ).toEqual([2]);
    expect(
      (client.getQueryData(VAULT_KEYS.chainGames) as { gameId: number }[]).map((g) => g.gameId)
    ).toEqual([416]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores frames that are not JSON", () => {
    const client = new QueryClient();
    expect(() => handleVaultFrame(client, "not json")).not.toThrow();
  });
});

// Captured from the production hub on 2026-09-10. The hub numbers frames per
// topic and reports the current number on subscribe; a skipped number is a
// frame this browser never saw, so the caches are resynced from REST once.
describe("revision tracking", () => {
  const SUBSCRIBED = {
    type: "subscribed",
    data: { topics: ["vault:king-of-night"], versions: { "vault:king-of-night": 23330 } },
    timestamp: 1789009502300,
  };
  const snapshot = (revision: number) => ({
    type: "activeGames",
    topic: "vault:king-of-night",
    data: { games: [] },
    revision,
    timestamp: 1789009504326,
  });

  beforeEach(() => resetRevisionTracking());

  it("resyncs once on a gap, and not on a contiguous sequence", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    handleVaultFrame(client, JSON.stringify(SUBSCRIBED));
    handleVaultFrame(client, JSON.stringify(snapshot(23331)));
    handleVaultFrame(client, JSON.stringify(snapshot(23332)));
    expect(invalidate).not.toHaveBeenCalled();

    handleVaultFrame(client, JSON.stringify(snapshot(23335)));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: VAULT_KEYS.all });

    handleVaultFrame(client, JSON.stringify(snapshot(23336)));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("ignores frames without a revision, from an older hub", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    handleVaultFrame(client, JSON.stringify(SUBSCRIBED));
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: [] } }));
    handleVaultFrame(client, JSON.stringify(snapshot(23331)));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
