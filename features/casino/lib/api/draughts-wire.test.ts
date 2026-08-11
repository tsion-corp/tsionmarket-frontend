import { describe, expect, it } from "vitest";
import {
  applyPositionFrame,
  applyTakebackOffersFrame,
  applyCommentDeletedFrame,
  applyCommentUpsertedFrame,
  isMatchId,
  toDraughtsChallenge,
  toDraughtsMatch,
  toResult,
  toVariant,
  type DraughtsMatchWire,
} from "@/features/casino/lib/api/draughts-wire";
import { STARTING_FEN } from "@/features/casino/lib/draughts/engine";
import { toSwissGameKind } from "@/features/casino/lib/api/swiss";

const MATCH_ID = "6f1c2a3e-1111-4222-8333-444455556666";

function wire(overrides: Partial<DraughtsMatchWire> = {}): DraughtsMatchWire {
  return {
    id: MATCH_ID,
    variant: "standard",
    startingFen: STARTING_FEN,
    white: "0x1111111111111111111111111111111111111111",
    black: "0x2222222222222222222222222222222222222222",
    status: "active",
    result: null,
    resultReason: null,
    fen: STARTING_FEN,
    turn: "white",
    ply: 0,
    timeControl: { initialSeconds: 30, incrementSeconds: 30 },
    clocks: { whiteMs: 30_000, blackMs: 30_000 },
    drawOfferBy: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    startedAt: "2026-08-10T10:00:05.000Z",
    finishedAt: null,
    ...overrides,
  };
}

describe("match ids", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(isMatchId(MATCH_ID)).toBe(true);
    expect(isMatchId(" not-an-id ")).toBe(false);
    expect(isMatchId("")).toBe(false);
  });
});

describe("variants", () => {
  it("keeps the two the engine actually implements", () => {
    expect(toVariant("standard")).toBe("standard");
    expect(toVariant("from_position")).toBe("from_position");
  });

  it("reads an unimplemented variant as standard rather than inventing a mode", () => {
    expect(toVariant("frisian")).toBe("standard");
    expect(toVariant("russian")).toBe("standard");
  });
});

describe("results", () => {
  it("pairs the winning side with its reason", () => {
    expect(toResult("white", "resign")).toEqual({
      kind: "win",
      winner: "white",
      reason: "resignation",
    });
    expect(toResult("black", "outoftime")).toEqual({
      kind: "win",
      winner: "black",
      reason: "timeout",
    });
  });

  it("reads the service's 'mate' as having no moves left", () => {
    // In draughts a blocked or wiped-out side loses; there is no check.
    expect(toResult("white", "mate")).toEqual({
      kind: "win",
      winner: "white",
      reason: "no_moves",
    });
  });

  it("maps draws to why they were drawn", () => {
    expect(toResult("draw", "draw_agreement")).toEqual({ kind: "draw", reason: "agreement" });
    expect(toResult("draw", "threefold_repetition")).toEqual({
      kind: "draw",
      reason: "repetition",
    });
    expect(toResult("draw", "twenty_five_move_rule")).toEqual({
      kind: "draw",
      reason: "move_rule",
    });
  });

  it("still produces a result for a reason it does not recognise", () => {
    expect(toResult("draw", "something_new")).toEqual({ kind: "draw", reason: "agreement" });
    expect(toResult(null, "resign")).toBeNull();
  });
});

describe("normalizing a match", () => {
  it("maps status to state and shortens the seats", () => {
    const match = toDraughtsMatch(wire());
    expect(match.state).toBe("in_progress");
    expect(match.white?.username).toMatch(/^0x1111/u);
    expect(match.white?.walletAddress).toBe("0x1111111111111111111111111111111111111111");
  });

  it("shows an equal base and increment as one per-move budget", () => {
    expect(toDraughtsMatch(wire()).timeControl).toBe("30s");
  });

  it("converts clocks to seconds", () => {
    const match = toDraughtsMatch(wire({ ply: 4, clocks: { whiteMs: 12_500, blackMs: 30_000 } }));
    expect(match.clocks).toEqual({ white: 12.5, black: 30 });
  });

  it("falls back to the starting bank on an opening snapshot with no clocks", () => {
    // A freshly started game can arrive before the service stamps the clocks;
    // showing 0:00 would read as a flagged game.
    const match = toDraughtsMatch(wire({ clocks: { whiteMs: 0, blackMs: 0 } }));
    expect(match.clocks).toEqual({ white: 30, black: 30 });
  });

  it("keeps a real zero clock on a game that is actually under way", () => {
    const match = toDraughtsMatch(wire({ ply: 9, clocks: { whiteMs: 0, blackMs: 4_000 } }));
    expect(match.clocks).toEqual({ white: 0, black: 4 });
  });

  it("resolves a draw offer to the side that made it", () => {
    const offered = wire({ drawOfferBy: "0x2222222222222222222222222222222222222222" });
    expect(toDraughtsMatch(offered).drawOffered).toBe("black");
    expect(toDraughtsMatch(wire()).drawOffered).toBeNull();
  });

  it("ignores a draw offer from someone who holds no seat", () => {
    const stray = wire({ drawOfferBy: "0x9999999999999999999999999999999999999999" });
    expect(toDraughtsMatch(stray).drawOffered).toBeNull();
  });

  it("takes the live topic from the response, with a fallback for an older service", () => {
    expect(toDraughtsMatch(wire({ liveTopic: "draughts:match:custom" })).liveTopic).toBe(
      "draughts:match:custom"
    );
    expect(toDraughtsMatch(wire()).liveTopic).toBe(`draughts:match:${MATCH_ID}`);
  });

  it("reports a free game as having no wager", () => {
    expect(toDraughtsMatch(wire()).wager).toBeNull();
  });

  it("carries a stake through", () => {
    const staked = toDraughtsMatch(
      wire({ wager: { stakeUsdc: "5", feeBps: 500, status: "locked" } })
    );
    expect(staked.wager).toEqual({
      stakeUsdc: "5",
      feeBps: 500,
      status: "locked",
      winnerPlayer: null,
    });
  });
});

describe("challenges", () => {
  it("takes the creator from whichever seat is filled", () => {
    const open = toDraughtsChallenge(wire({ status: "waiting", black: null }));
    expect(open.creator?.walletAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(open.inviteCode).toBe(MATCH_ID);
  });
});

describe("live frames", () => {
  it("takes the board from a position frame", () => {
    const prev = toDraughtsMatch(wire());
    const next = applyPositionFrame(prev, {
      fen: "B:W,26:B,1",
      turn: "black",
      ply: 1,
      lastMove: { uci: "3126", san: "31-26" },
      clocks: { whiteMs: 28_000, blackMs: 30_000 },
      status: "active",
    });
    expect(next.fen).toBe("B:W,26:B,1");
    expect(next.turn).toBe("black");
    expect(next.clocks.white).toBe(28);
    expect(next.moves).toEqual(["31-26"]);
  });

  it("only extends the history when the frame is exactly the next ply", () => {
    const prev = toDraughtsMatch(wire());
    // A frame that skips ahead means one was missed; the poll repairs it rather
    // than the move panel silently desyncing from the board.
    const gap = applyPositionFrame(prev, {
      fen: "B:W,26:B,1",
      turn: "black",
      ply: 5,
      lastMove: { uci: "3126", san: "31-26" },
    });
    expect(gap.moves).toEqual([]);
    expect(gap.fen).toBe("B:W,26:B,1");
  });

  it("reads a takeback offer ply as an offer standing", () => {
    const prev = toDraughtsMatch(wire());
    const next = applyTakebackOffersFrame(prev, { white: 4, black: null });
    expect(next.takeback.white).toBe(true);
    expect(next.takeback.black).toBe(false);
  });

  it("replaces a comment on re-upsert and drops it on delete", () => {
    const base = {
      id: "c1",
      matchId: MATCH_ID,
      ply: 2,
      fen: STARTING_FEN,
      author: "0x1",
      text: "first",
      createdAt: "2026-08-10T10:01:00.000Z",
      updatedAt: "2026-08-10T10:01:00.000Z",
    };
    const added = applyCommentUpsertedFrame([], base);
    expect(added).toHaveLength(1);

    const edited = applyCommentUpsertedFrame(added, { ...base, text: "second" });
    expect(edited).toHaveLength(1);
    expect(edited[0].text).toBe("second");

    expect(applyCommentDeletedFrame(edited, { id: "c1", matchId: MATCH_ID, ply: 2 })).toEqual([]);
  });
});

describe("swiss game kind", () => {
  it("reads draughts, and treats everything else as chess", () => {
    expect(toSwissGameKind("draughts")).toBe("draughts");
    expect(toSwissGameKind("chess")).toBe("chess");
    // Tournaments created before draughts existed carry no kind at all.
    expect(toSwissGameKind(undefined)).toBe("chess");
  });
});
