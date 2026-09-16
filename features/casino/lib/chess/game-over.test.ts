import { describe, expect, it } from "vitest";
import type { ChessMatch, ChessMatchAnalysis } from "@/features/casino/lib/api/types";
import {
  CHESS_PLAY_ONLINE_ROUTE,
  chessGameOverCounters,
  chessGameOverEventKey,
  chessGameOverPresentation,
  chessGameOverReason,
} from "@/features/casino/lib/chess/game-over";

type GameOverMatch = Pick<ChessMatch, "id" | "state" | "result" | "resultReason" | "finishedAt">;

function match(overrides: Partial<GameOverMatch> = {}): GameOverMatch {
  return {
    id: "match-1",
    state: "settled",
    result: { kind: "checkmate", winner: "w" },
    resultReason: "checkmate",
    finishedAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("chess game-over presentation", () => {
  it("presents a decisive result relative to each player", () => {
    expect(chessGameOverPresentation(match(), "w")).toMatchObject({
      outcome: "win",
      winner: "w",
      loser: "b",
      reason: "checkmate",
    });
    expect(chessGameOverPresentation(match(), "b").outcome).toBe("loss");
  });

  it("uses a neutral winner presentation for spectators", () => {
    expect(chessGameOverPresentation(match(), null).outcome).toBe("spectator");
  });

  it("keeps uncommon draw reasons distinct", () => {
    expect(
      chessGameOverReason(
        match({
          result: { kind: "draw", reason: "fifty_move_rule" },
          resultReason: "fifty_move_rule",
        })
      )
    ).toBe("fifty_move_rule");
    expect(
      chessGameOverReason(
        match({
          result: { kind: "draw", reason: "timeout_insufficient" },
          resultReason: "timeout_vs_insufficient_material",
        })
      )
    ).toBe("timeout_insufficient");
  });

  it("does not invent a winner for an aborted game", () => {
    expect(
      chessGameOverPresentation(
        match({ state: "cancelled", result: null, resultReason: "abort" }),
        "w"
      )
    ).toEqual({ outcome: "aborted", reason: "aborted", winner: null, loser: null });
  });

  it("keys celebrations by authoritative completion metadata", () => {
    expect(chessGameOverEventKey(match())).toBe(
      "match-1:2026-09-15T10:00:00.000Z:settled:checkmate"
    );
  });

  it("uses the human lobby for the new-game action", () => {
    expect(CHESS_PLAY_ONLINE_ROUTE).toBe("/casino/chess?tab=lobby&setup=hook#game-setup");
  });

  it("groups every analysed move into a visible quality counter", () => {
    const analysis = {
      status: "completed",
      moves: [
        { side: "white", classification: "best" },
        { side: "white", classification: "good" },
        { side: "white", classification: "inaccuracy" },
        { side: "white", classification: "mistake" },
        { side: "white", classification: "blunder" },
        { side: "black", classification: "blunder" },
      ],
    } as ChessMatchAnalysis;

    expect(chessGameOverCounters(analysis, "w")).toEqual({
      bestAndGood: 2,
      mistakesAndInaccuracies: 2,
      blunders: 1,
    });
  });
});
