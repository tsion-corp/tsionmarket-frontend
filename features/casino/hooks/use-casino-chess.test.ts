import { describe, expect, it } from "vitest";
import { chessMatchRefetchMs, optimisticMove } from "@/features/casino/hooks/use-casino-chess";
import type { ChessMatch } from "@/features/casino/lib/api/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("chess match polling", () => {
  it("keeps waiting games polling so an opponent join shows up quickly", () => {
    expect(chessMatchRefetchMs("awaiting_opponent", false)).toBe(1000);
    expect(chessMatchRefetchMs("awaiting_opponent", true)).toBe(1000);
  });

  it("slows only once an active game has a live socket feed", () => {
    expect(chessMatchRefetchMs("in_progress", false)).toBe(1000);
    expect(chessMatchRefetchMs("in_progress", true)).toBe(5000);
  });

  it("stops polling once the game is over", () => {
    expect(chessMatchRefetchMs("settled", false)).toBe(false);
    expect(chessMatchRefetchMs("cancelled", true)).toBe(false);
  });
});

describe("optimistic chess moves", () => {
  it("updates the position, turn, and SAN history before server acknowledgement", () => {
    const match = {
      id: "match-1",
      state: "in_progress",
      videoEnabled: false,
      white: null,
      black: null,
      timeControl: "Unlimited",
      clockMode: "unlimited",
      computer: null,
      fen: START_FEN,
      moves: [],
      clocks: { w: 600, b: 600 },
      clockUpdatedAt: "2026-09-06T00:00:00.000Z",
      turn: "w",
      result: null,
      drawOffered: null,
      takeback: { white: false, black: false, takebackable: false },
      rematch: { offeredBy: null, nextMatchId: null },
      timeExtensions: { allowed: false, used: 0, totalSeconds: 0, maxUses: 0, maxTotalSeconds: 0 },
      stakeUsdc: null,
      wagerStatus: null,
      liveTopic: "chess:match:match-1",
      createdAt: "2026-09-06T00:00:00.000Z",
    } satisfies ChessMatch;

    expect(optimisticMove(match, "e2e4")?.match).toMatchObject({
      turn: "b",
      moves: ["e4"],
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    });
  });
});
