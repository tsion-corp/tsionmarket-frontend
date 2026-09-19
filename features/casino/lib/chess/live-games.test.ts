import { describe, expect, it } from "vitest";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import { applyLiveGamesFrame } from "@/features/casino/lib/chess/live-games";

function liveMatch(): ChessMatch {
  return {
    id: "match-1",
    state: "in_progress",
    videoEnabled: false,
    white: null,
    black: null,
    timeControl: "5+0",
    clockMode: "real_time",
    computer: null,
    variant: "standard",
    initialFen: "start",
    chess960Position: null,
    fen: "before",
    moves: [],
    round: null,
    clocks: { w: 300, b: 300 },
    clockUpdatedAt: "2026-09-17T17:00:00.000Z",
    turn: "w",
    result: null,
    drawOffered: null,
    takeback: { white: false, black: false, takebackable: false },
    rematch: { offeredBy: null, nextMatchId: null },
    timeExtensions: {
      allowed: false,
      used: 0,
      totalSeconds: 0,
      maxUses: 0,
      maxTotalSeconds: 0,
    },
    rating: undefined,
    stakeUsdc: null,
    wagerStatus: null,
    liveTopic: "chess:match:match-1",
    createdAt: "2026-09-17T17:00:00.000Z",
  };
}

describe("applyLiveGamesFrame", () => {
  it("applies a pushed move to the matching mini-board", () => {
    const next = applyLiveGamesFrame([liveMatch()], {
      type: "position",
      topic: "chess:live",
      data: {
        matchId: "match-1",
        fen: "after",
        turn: "black",
        ply: 1,
        lastMove: { uci: "e2e4", san: "e4" },
        clocks: { whiteMs: 299_000, blackMs: 300_000 },
        clockUpdatedAt: "2026-09-17T17:00:01.000Z",
        status: "active",
      },
    });

    expect(next?.[0]).toMatchObject({
      fen: "after",
      turn: "b",
      moves: ["e4"],
      clocks: { w: 299, b: 300 },
    });
  });

  it("removes a finished game immediately", () => {
    expect(
      applyLiveGamesFrame([liveMatch()], {
        type: "gameOver",
        topic: "chess:live",
        data: { matchId: "match-1", result: "white" },
      })
    ).toEqual([]);
  });
});
