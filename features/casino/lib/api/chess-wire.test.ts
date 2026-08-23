import { describe, it, expect } from "vitest";
import {
  applyPositionFrame,
  applyStateFrame,
  applyChatLineFrame,
  applyCommentDeletedFrame,
  applyCommentUpsertedFrame,
  applyRematchOfferFrame,
  applyRematchTakenFrame,
  applyTakebackOffersFrame,
  mergeChessMatchSnapshot,
  formatTimeControl,
  isMatchId,
  parseTimeControl,
  toChessChallenge,
  toChessMatch,
  toResult,
  type ChessMatchWire,
  type ChessMoveWire,
} from "@/features/casino/lib/api/chess-wire";

// The chess service is the authority on a game, and this is the only place its
// shape is understood. A mapping error here shows up as a wrong result on a
// settled board, so every branch is pinned.

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const wire = (over: Partial<ChessMatchWire> = {}): ChessMatchWire => ({
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  status: "active",
  fen: START_FEN,
  turn: "white",
  ply: 0,
  timeControl: { initialSeconds: 300, incrementSeconds: 3 },
  clocks: { whiteMs: 300_000, blackMs: 297_500 },
  white: "0xwhite",
  black: "0xblack",
  drawOfferBy: null,
  result: null,
  resultReason: null,
  createdAt: "2026-07-30T09:00:00.000Z",
  startedAt: "2026-07-30T09:01:00.000Z",
  finishedAt: null,
  ...over,
});

const move = (over: Partial<ChessMoveWire> = {}): ChessMoveWire => ({
  ply: 1,
  uci: "e2e4",
  san: "e4",
  fenAfter: START_FEN,
  byPlayer: "0xwhite",
  clockMsRemaining: 299_000,
  createdAt: "2026-07-30T09:01:30.000Z",
  ...over,
});

describe("match id", () => {
  it("accepts a uuid and rejects anything the gateway would choke on", () => {
    expect(isMatchId("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isMatchId("does-not-exist")).toBe(false);
    expect(isMatchId("")).toBe(false);
  });
});

describe("time control", () => {
  it("reads whole minutes as the familiar label", () => {
    expect(formatTimeControl(300, 3)).toBe("5+3");
    expect(formatTimeControl(180, 2)).toBe("3+2");
    expect(formatTimeControl(600, 0)).toBe("10+0");
  });

  it("keeps seconds for a control that is not whole minutes", () => {
    expect(formatTimeControl(90, 1)).toBe("90s+1");
  });

  it("round-trips the presets", () => {
    for (const label of ["3+2", "5+3", "10+0", "15+10"]) {
      const { initialSeconds, incrementSeconds } = parseTimeControl(label);
      expect(formatTimeControl(initialSeconds, incrementSeconds)).toBe(label);
    }
  });

  it("refuses a label it cannot turn into seconds", () => {
    expect(() => parseTimeControl("bullet")).toThrow(/Unrecognised time control/);
  });
});

describe("result", () => {
  it("has no result while a game is running", () => {
    expect(toResult(null, null)).toBeNull();
  });

  it("pairs a winner with how they won", () => {
    expect(toResult("white", "checkmate")).toEqual({ kind: "checkmate", winner: "w" });
    expect(toResult("black", "resignation")).toEqual({ kind: "resignation", winner: "b" });
    expect(toResult("white", "timeout")).toEqual({ kind: "timeout", winner: "w" });
    expect(toResult("black", "flagged on time")).toEqual({ kind: "timeout", winner: "b" });
  });

  it("maps every way a game can be drawn", () => {
    expect(toResult("draw", "stalemate")).toEqual({ kind: "draw", reason: "stalemate" });
    expect(toResult("draw", "threefold_repetition")).toEqual({
      kind: "draw",
      reason: "repetition",
    });
    expect(toResult("draw", "insufficient_material")).toEqual({
      kind: "draw",
      reason: "insufficient",
    });
    expect(toResult("draw", "agreement")).toEqual({ kind: "draw", reason: "agreement" });
  });

  // The reason is the service's free text. An unfamiliar one still has to
  // produce a usable result rather than losing a finished game.
  it("falls back rather than dropping a result it doesn't recognise", () => {
    expect(toResult("draw", "some_new_rule")).toEqual({ kind: "draw", reason: "agreement" });
    expect(toResult("draw", null)).toEqual({ kind: "draw", reason: "agreement" });
    expect(toResult("white", "some_new_way")).toEqual({ kind: "checkmate", winner: "w" });
    expect(toResult("white", null)).toEqual({ kind: "checkmate", winner: "w" });
  });
});

describe("player identity", () => {
  it("maps backend public profiles onto both match seats", () => {
    const match = toChessMatch(
      wire({
        whiteCountryCode: "NG",
        blackCountryCode: "GH",
        whiteDisplayName: "Abraham Anavheoba",
        blackDisplayName: "Kwame Player",
      })
    );

    expect(match.white?.countryCode).toBe("NG");
    expect(match.black?.countryCode).toBe("GH");
    expect(match.white?.username).toBe("Abraham Anavheoba");
    expect(match.black?.username).toBe("Kwame Player");
  });
});

describe("match", () => {
  it("maps every lifecycle status onto our state", () => {
    expect(toChessMatch(wire({ status: "waiting" })).state).toBe("awaiting_opponent");
    expect(toChessMatch(wire({ status: "active" })).state).toBe("in_progress");
    expect(toChessMatch(wire({ status: "finished" })).state).toBe("settled");
    expect(toChessMatch(wire({ status: "aborted" })).state).toBe("cancelled");
  });

  it("converts clocks from milliseconds to seconds", () => {
    expect(toChessMatch(wire()).clocks).toEqual({ w: 300, b: 297.5 });
  });

  it("falls back to the starting bank when a fresh live snapshot carries zero clocks", () => {
    expect(
      toChessMatch(
        wire({
          ply: 0,
          timeControl: { initialSeconds: 300, incrementSeconds: 0 },
          clocks: { whiteMs: 0, blackMs: 0 },
        })
      ).clocks
    ).toEqual({ w: 300, b: 300 });
  });

  it("dates the clocks from the last move, so the countdown starts there", () => {
    const match = toChessMatch(wire(), { moves: [move(), move({ ply: 2, san: "e5" })] });
    expect(match.clockUpdatedAt).toBe("2026-07-30T09:01:30.000Z");
  });

  it("dates the clocks from the start when no move has been played", () => {
    expect(toChessMatch(wire()).clockUpdatedAt).toBe("2026-07-30T09:01:00.000Z");
  });

  it("prefers the backend clock anchor over browser-local history", () => {
    expect(
      toChessMatch(wire({ clockUpdatedAt: "2026-07-30T09:01:12.345Z" }), {
        clockUpdatedAt: "2026-07-30T09:01:20.000Z",
      }).clockUpdatedAt
    ).toBe("2026-07-30T09:01:12.345Z");
  });

  it("falls back to creation time for a game that never started", () => {
    expect(toChessMatch(wire({ status: "waiting", startedAt: null })).clockUpdatedAt).toBe(
      "2026-07-30T09:00:00.000Z"
    );
  });

  it("leaves an empty seat empty rather than inventing a player", () => {
    const match = toChessMatch(wire({ status: "waiting", black: null }));
    expect(match.black).toBeNull();
    expect(match.white).toMatchObject({ walletAddress: "0xwhite", rating: null });
  });

  it("maps an unlimited computer match and names the engine seat", () => {
    const match = toChessMatch(
      wire({
        timeControl: { mode: "unlimited", initialSeconds: 600, incrementSeconds: 3 },
        computer: {
          player: "0x00000000000000000000000000000000000000b6",
          name: "Stockfish level 6",
          side: "black",
          level: 6,
        },
        black: "0x00000000000000000000000000000000000000b6",
      })
    );

    expect(match.clockMode).toBe("unlimited");
    expect(match.timeControl).toBe("Unlimited");
    expect(match.computer).toMatchObject({ level: 6, side: "black" });
    expect(match.black).toMatchObject({ username: "Stockfish level 6", rating: null });
  });

  it("keeps the backend computer reward quote intact", () => {
    const match = toChessMatch(
      wire({
        computer: {
          player: "0x00000000000000000000000000000000000000b4",
          name: "Stockfish level 4",
          side: "black",
          level: 4,
          wager: {
            stakeUsdc: "10",
            houseExposureUsdc: "2.5",
            potentialPayoutUsdc: "12.3",
            feeBps: 800,
            status: "active",
            payoutUsdc: "0",
          },
        },
      })
    );

    expect(match.computer?.wager).toEqual({
      stakeUsdc: "10",
      houseExposureUsdc: "2.5",
      potentialPayoutUsdc: "12.3",
      feeBps: 800,
      status: "active",
      payoutUsdc: "0",
    });
  });

  it("keeps non-wallet seat names readable for managed tournament games", () => {
    const match = toChessMatch(wire({ white: "0xDD0737-6C2E", black: "0x235e47-6278" }));
    expect(match.white?.username).toBe("0xDD0737-6C2E");
    expect(match.black?.username).toBe("0x235e47-6278");
  });

  it("resolves a draw offer to the side that made it", () => {
    expect(toChessMatch(wire({ drawOfferBy: "0xwhite" })).drawOffered).toBe("w");
    expect(toChessMatch(wire({ drawOfferBy: "0xblack" })).drawOffered).toBe("b");
    expect(toChessMatch(wire()).drawOffered).toBeNull();
    // An address that holds neither seat is not a side.
    expect(toChessMatch(wire({ drawOfferBy: "0xother" })).drawOffered).toBeNull();
  });

  it("maps the takeback and rematch state carried on the match", () => {
    const match = toChessMatch(
      wire({
        takeback: { white: true, black: false, takebackable: true },
        rematch: { offeredBy: "0xwhite", nextMatchId: "next-1" },
      })
    );
    expect(match.takeback).toEqual({ white: true, black: false, takebackable: true });
    expect(match.rematch).toEqual({ offeredBy: "0xwhite", nextMatchId: "next-1" });
  });

  it("takes the move list in order", () => {
    const match = toChessMatch(wire(), {
      moves: [move(), move({ ply: 2, san: "c5" }), move({ ply: 3, san: "Nf3" })],
    });
    expect(match.moves).toEqual(["e4", "c5", "Nf3"]);
  });

  // A free game carries no stake; a wager-backed one carries exactly the
  // per-player USDC stake the cashier locked, nothing invented client-side.
  it("reads the stake from the wager, null when played for free", () => {
    expect(toChessMatch(wire()).stakeUsdc).toBeNull();
    const staked = toChessMatch(
      wire({
        wager: {
          stakeUsdc: "10",
          feeBps: 500,
          status: "active",
          winnerPlayer: null,
        },
      })
    );
    expect(staked.stakeUsdc).toBe("10");
  });
});

describe("live game frames", () => {
  it("uses the same server clock anchor for a pushed move in every browser", () => {
    const active = toChessMatch(wire());
    const next = applyPositionFrame(active, {
      fen: active.fen,
      turn: "black",
      ply: 1,
      lastMove: { uci: "e2e4", san: "e4" },
      clocks: { whiteMs: 294_000, blackMs: 300_000 },
      clockUpdatedAt: "2026-07-30T09:01:06.000Z",
      status: "active",
    });

    expect(next.clockUpdatedAt).toBe("2026-07-30T09:01:06.000Z");
  });

  it("never lets a late waiting snapshot overwrite an accepted challenge", () => {
    const waiting = toChessMatch(wire({ status: "waiting", black: null, startedAt: null }));
    const active = toChessMatch(wire({ status: "active" }));
    const finished = toChessMatch(
      wire({
        status: "finished",
        result: "white",
        resultReason: "checkmate",
        finishedAt: "2026-07-30T09:03:00.000Z",
      })
    );

    expect(mergeChessMatchSnapshot(waiting, active)).toBe(active);
    expect(mergeChessMatchSnapshot(active, waiting)).toBe(active);
    expect(mergeChessMatchSnapshot(finished, active)).toBe(finished);
  });

  it("keeps move history while applying the authoritative terminal snapshot", () => {
    const active = toChessMatch(wire(), { moveSan: ["f3", "e5", "g4"] });
    const afterMatePosition = applyPositionFrame(active, {
      fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
      turn: "white",
      ply: 4,
      lastMove: { uci: "d8h4", san: "Qh4#" },
      clocks: { whiteMs: 281_000, blackMs: 286_000 },
      status: "finished",
    });

    // The compact position frame ends interaction immediately but intentionally
    // carries no result/rating metadata. The following full state frame does.
    expect(afterMatePosition.state).toBe("settled");
    expect(afterMatePosition.result).toBeNull();
    expect(afterMatePosition.moves).toEqual(["f3", "e5", "g4", "Qh4#"]);

    const terminal = applyStateFrame(
      afterMatePosition,
      wire({
        status: "finished",
        fen: afterMatePosition.fen,
        turn: "white",
        ply: 4,
        clocks: { whiteMs: 281_000, blackMs: 286_000 },
        result: "black",
        resultReason: "checkmate",
        finishedAt: "2026-07-30T09:03:00.000Z",
        takeback: { white: false, black: false, takebackable: false },
        rematch: { offeredBy: "0xblack", nextMatchId: null },
        rating: {
          rated: true,
          perfKey: "blitz",
          white: { rating: 1500, provisional: true, diff: -181 },
          black: { rating: 1500, provisional: true, diff: 181 },
        },
      })
    );

    expect(terminal.moves).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(terminal.result).toEqual({ kind: "checkmate", winner: "b" });
    expect(terminal.clocks).toEqual({ w: 281, b: 286 });
    expect(terminal.rating?.white.diff).toBe(-181);
    expect(terminal.rating?.black.diff).toBe(181);
    expect(terminal.rematch.offeredBy).toBe("0xblack");
    expect(terminal.takeback.takebackable).toBe(false);
  });

  it("preserves clock-extension capability when a compact state frame omits it", () => {
    const active = toChessMatch(
      wire({
        timeExtensions: {
          allowed: true,
          used: 0,
          totalSeconds: 0,
          maxUses: 3,
          maxTotalSeconds: 1_800,
        },
      })
    );
    const compact = wire({ clocks: { whiteMs: 290_000, blackMs: 289_000 } });
    delete compact.timeExtensions;

    const next = applyStateFrame(active, compact);

    expect(next.timeExtensions.allowed).toBe(true);
    expect(next.timeExtensions.maxUses).toBe(3);
  });
});

describe("live social frames", () => {
  it("updates the cached takeback state in place", () => {
    const match = applyTakebackOffersFrame(toChessMatch(wire()), { white: false, black: true });
    expect(match.takeback.white).toBe(false);
    expect(match.takeback.black).toBe(true);
  });

  it("updates the cached rematch offer and destination in place", () => {
    const base = toChessMatch(wire());
    const offered = applyRematchOfferFrame(base, { offeredBy: "0xblack" });
    const taken = applyRematchTakenFrame(offered, { nextMatchId: "next-2" });
    expect(offered.rematch.offeredBy).toBe("0xblack");
    expect(taken.rematch.nextMatchId).toBe("next-2");
  });

  it("appends chat lines once and keeps them in order", () => {
    const base = [
      {
        id: 1,
        matchId: wire().id,
        room: "spectator" as const,
        author: "0xwhite",
        text: "hello",
        createdAt: "2026-08-02T20:00:00.000Z",
      },
    ];
    const next = applyChatLineFrame(base, {
      id: 2,
      matchId: wire().id,
      room: "spectator",
      author: "0xblack",
      text: "hi",
      createdAt: "2026-08-02T20:01:00.000Z",
    });
    const deduped = applyChatLineFrame(next, {
      id: 2,
      matchId: wire().id,
      room: "spectator",
      author: "0xblack",
      text: "hi",
      createdAt: "2026-08-02T20:01:00.000Z",
    });
    expect(next.map((line) => line.id)).toEqual([1, 2]);
    expect(deduped).toEqual(next);
  });

  it("upserts and deletes position comments by id", () => {
    const initial = [
      {
        id: "c1",
        matchId: wire().id,
        ply: 3,
        fen: "fen",
        author: "0xwhite",
        text: "idea",
        createdAt: "2026-08-02T20:00:00.000Z",
        updatedAt: "2026-08-02T20:00:00.000Z",
      },
    ];
    const upserted = applyCommentUpsertedFrame(initial, {
      id: "c1",
      matchId: wire().id,
      ply: 3,
      fen: "fen",
      author: "0xwhite",
      text: "better idea",
      createdAt: "2026-08-02T20:00:00.000Z",
      updatedAt: "2026-08-02T20:01:00.000Z",
    });
    const deleted = applyCommentDeletedFrame(upserted, {
      id: "c1",
      matchId: wire().id,
      ply: 3,
      author: "0xwhite",
    });
    expect(upserted[0]?.text).toBe("better idea");
    expect(deleted).toEqual([]);
  });
});

describe("challenge", () => {
  it("presents a waiting game as joinable, with the match id as the invite", () => {
    const c = toChessChallenge(wire({ status: "waiting", black: null, videoEnabled: true }));
    expect(c.id).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(c.inviteCode).toBe(c.id);
    expect(c.creator.walletAddress).toBe("0xwhite");
    expect(c.timeControl).toBe("5+3");
    expect(c.stakeUsdc).toBeNull();
    expect(c.videoEnabled).toBe(true);
    expect(toChessMatch(wire({ videoEnabled: true })).videoEnabled).toBe(true);
  });

  it("prefers the service's own invite code when it sends one", () => {
    const c = toChessChallenge(wire({ status: "waiting", inviteCode: "SHORT1" }));
    expect(c.inviteCode).toBe("SHORT1");
  });

  it("takes the creator from whichever seat is filled", () => {
    const c = toChessChallenge(wire({ status: "waiting", white: null }));
    expect(c.creator.walletAddress).toBe("0xblack");
  });
});
