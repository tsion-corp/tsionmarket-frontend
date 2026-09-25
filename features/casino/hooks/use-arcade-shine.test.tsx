import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// reportShine is the seam. Everything past it — the on/off gate, the durable
// (account, service, id) dedup, the queue and the sentence — belongs to
// lib/shine and is tested there. What is under test here is which facts the
// arcade hands over, and how many times.
const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

import {
  useArkballShine,
  useChessShine,
  useDraughtsShine,
  useVaultShine,
} from "@/features/casino/hooks/use-arcade-shine";
import type { ChessShineMatch, DraughtsShineMatch } from "@/features/casino/lib/shine/arcade";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";

function chessMatch(over: Partial<ChessShineMatch> = {}): ChessShineMatch {
  return {
    id: "match-1",
    state: "settled",
    result: { kind: "checkmate", winner: "w" },
    resultReason: "checkmate",
    finishedAt: "2026-09-24T10:00:00.000Z",
    stakeUsdc: "10",
    wagerFeeBps: 1_000,
    computer: null,
    ...over,
  };
}

function draughtsMatch(over: Partial<DraughtsShineMatch> = {}): DraughtsShineMatch {
  return {
    id: "draughts-1",
    state: "settled",
    result: { kind: "win", winner: "white", reason: "timeout" },
    wager: { stakeUsdc: "10", feeBps: 1_000, status: "settled", winnerPlayer: "0xwhite" },
    computer: null,
    ...over,
  };
}

function wonTicket(over: Partial<LotteryTicket> = {}): LotteryTicket {
  return {
    id: "ticket-1",
    drawId: "draw-9",
    player: "0xabc",
    receiptHash: "0xhash",
    priceUsdc: "2",
    whiteNumbers: [1, 2, 3, 4, 5],
    powerNumber: 6,
    status: "won",
    payoutUsdc: "100",
    acceptedAt: new Date(Date.now() - 60_000).toISOString(),
    settledAt: new Date(Date.now() - 30_000).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  shine.reportShine.mockReset();
});
afterEach(cleanup);

describe("chess", () => {
  it("reports a win once, and keeps reporting the same id when the cache re-serves it", () => {
    // Every frame below is a distinct object: a socket push and a poll both
    // write this cache, so identity changes on refetch even when nothing did.
    const { rerender } = renderHook(
      ({ match }: { match: ChessShineMatch }) => useChessShine(match, "w"),
      { initialProps: { match: chessMatch({ state: "in_progress", result: null }) } }
    );
    rerender({ match: chessMatch() });
    rerender({ match: chessMatch() });
    rerender({ match: chessMatch() });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "chess:match-1",
      game: "Chess",
      outcome: "won",
      pnl: "+80%",
    });
  });

  it("reports nothing for a loss, a spectator or an abort", () => {
    const live = chessMatch({ state: "in_progress", result: null });
    for (const [match, you] of [
      [chessMatch(), "b"],
      [chessMatch(), null],
      [chessMatch({ state: "cancelled" }), "w"],
    ] as const) {
      const { rerender, unmount } = renderHook(
        ({ next }: { next: ChessShineMatch }) => useChessShine(next, you),
        { initialProps: { next: live } }
      );
      rerender({ next: match });
      unmount();
    }
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("reports a draw as the drawn variant", () => {
    const { rerender } = renderHook(
      ({ match }: { match: ChessShineMatch }) => useChessShine(match, "b"),
      { initialProps: { match: chessMatch({ state: "in_progress", result: null }) } }
    );
    rerender({ match: chessMatch({ result: { kind: "draw", reason: "stalemate" } }) });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine.mock.calls[0]?.[0]).toMatchObject({
      id: "chess:match-1",
      outcome: "drawn",
      pnl: null,
    });
  });

  it("does not post a finished game that is merely being opened", () => {
    // Remounting on a settled match — a navigation, a tab refocus, a reload —
    // must not look like the game just ended. It is also what keeps a player's
    // whole history out of the square the first time Shine is switched on,
    // when the dedup store has no record of any of it.
    const { unmount } = renderHook(() => useChessShine(chessMatch(), "w"));
    unmount();
    renderHook(() => useChessShine(chessMatch(), "w"));
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("gives the two chess resolutions the same id, so the store can collapse them", () => {
    // lichess-round and play-section resolve the same match independently.
    for (let i = 0; i < 2; i += 1) {
      const { rerender, unmount } = renderHook(
        ({ match }: { match: ChessShineMatch }) => useChessShine(match, "w"),
        { initialProps: { match: chessMatch({ state: "in_progress", result: null }) } }
      );
      rerender({ match: chessMatch() });
      unmount();
    }
    const ids = shine.reportShine.mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(ids).toEqual(["chess:match-1", "chess:match-1"]);
  });
});

describe("draughts", () => {
  it("reports a win once across repeated frames", () => {
    const { rerender } = renderHook(
      ({ match }: { match: DraughtsShineMatch }) => useDraughtsShine(match, "white"),
      { initialProps: { match: draughtsMatch({ state: "in_progress", result: null }) } }
    );
    rerender({ match: draughtsMatch() });
    rerender({ match: draughtsMatch() });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "checkers:draughts-1",
      game: "Checkers",
      outcome: "won",
      pnl: "+80%",
    });
  });

  it("reports nothing for the losing seat or a spectator, and a draw as drawn", () => {
    const live = draughtsMatch({ state: "in_progress", result: null });
    const run = (seat: "white" | "black" | null, settled: DraughtsShineMatch) => {
      const { rerender, unmount } = renderHook(
        ({ match }: { match: DraughtsShineMatch }) => useDraughtsShine(match, seat),
        { initialProps: { match: live } }
      );
      rerender({ match: settled });
      unmount();
    };
    run("black", draughtsMatch());
    run(null, draughtsMatch());
    expect(shine.reportShine).not.toHaveBeenCalled();

    run("black", draughtsMatch({ result: { kind: "draw", reason: "move_rule" } }));
    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine.mock.calls[0]?.[0]).toMatchObject({ outcome: "drawn" });
  });

  it("does not post a settled match opened cold", () => {
    renderHook(() => useDraughtsShine(draughtsMatch(), "white"));
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

describe("the vault", () => {
  it("reports once when the reveal lands, however often the screen re-renders", () => {
    const { rerender } = renderHook(({ won }: { won: boolean }) => useVaultShine(184, won), {
      initialProps: { won: false },
    });
    rerender({ won: true });
    // The claim settles and the prize figure changes under it; the reveal
    // effect re-runs several times while that happens.
    rerender({ won: true });
    rerender({ won: true });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "last-standing:184",
      game: "The Last Man",
      outcome: "won",
      pnl: null,
    });
  });

  it("reports nothing while the round has not been revealed as won", () => {
    // A wager landing at the buzzer continues the round: the screen's reveal
    // re-reads the status, backs out, and never reaches "won".
    const { rerender } = renderHook(({ won }: { won: boolean }) => useVaultShine(184, won), {
      initialProps: { won: false },
    });
    rerender({ won: false });
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

describe("ArkBall", () => {
  it("reports a fresh win once, however many times the fifteen-second poll returns it", () => {
    const { rerender } = renderHook(
      ({ tickets }: { tickets: LotteryTicket[] }) => useArkballShine(tickets),
      { initialProps: { tickets: [wonTicket({ status: "active", payoutUsdc: "0" })] } }
    );
    rerender({ tickets: [wonTicket()] });
    rerender({ tickets: [wonTicket()] });
    rerender({ tickets: [wonTicket()] });

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "arcade",
      id: "arkball:ticket-1",
      game: "ArkBall",
      outcome: "won",
      pnl: "+4,900%",
    });
  });

  it("reports nothing for losing tickets or for a backlog of old wins", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    renderHook(() =>
      useArkballShine([
        wonTicket({ id: "t-lost", status: "lost", payoutUsdc: "0" }),
        wonTicket({ id: "t-old-1", settledAt: old }),
        wonTicket({ id: "t-old-2", settledAt: old }),
      ])
    );
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("hands a remount the same ticket id, which is what the store dedups on", () => {
    const { unmount } = renderHook(() => useArkballShine([wonTicket()]));
    unmount();
    renderHook(() => useArkballShine([wonTicket()]));

    const ids = shine.reportShine.mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(ids).toEqual(["arkball:ticket-1", "arkball:ticket-1"]);
  });
});
