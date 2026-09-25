import { describe, expect, it } from "vitest";
import {
  ARKBALL_FRESH_WIN_MS,
  arkballShineEvent,
  arkjetShineEvent,
  chessShineEvent,
  chickenShineEvent,
  draughtsShineEvent,
  vaultShineEvent,
  type ChessShineMatch,
  type DraughtsShineMatch,
} from "@/features/casino/lib/shine/arcade";
import type { ArkjetBet, ChickenSession } from "@/features/casino/lib/api/arkjet";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";

// A staked head-to-head chess match, white to be the winner unless said
// otherwise. Both seats lock $10 and the platform takes 10% of the $20 pot,
// so the winner collects $18 on a $10 stake: +80%.
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
    result: { kind: "win", winner: "white", reason: "resignation" },
    wager: { stakeUsdc: "10", feeBps: 1_000, status: "settled", winnerPlayer: "0xwhite" },
    computer: null,
    ...over,
  };
}

function ticket(over: Partial<LotteryTicket> = {}): LotteryTicket {
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
    acceptedAt: "2026-09-24T09:00:00.000Z",
    settledAt: "2026-09-24T10:00:00.000Z",
    ...over,
  };
}

function arkjetBet(over: Partial<ArkjetBet> = {}): ArkjetBet {
  return {
    betId: "bet-1",
    roundId: "round-1",
    panelId: "A",
    currency: "USDC",
    amount: "5",
    maximumCashoutMultiplier: "100",
    automaticCashoutMultiplier: null,
    maximumPayout: "500",
    reservedNetLiability: "0",
    status: "CASHED_OUT",
    cashoutMultiplier: "2.5",
    payout: "12.5",
    idempotencyKey: "key-1",
    acceptedAt: "2026-09-24T10:00:00.000Z",
    settledAt: "2026-09-24T10:00:30.000Z",
    ...over,
  };
}

function chickenSession(over: Partial<ChickenSession> = {}): ChickenSession {
  return {
    sessionId: "chicken-1",
    status: "cashed_out",
    difficulty: "easy",
    currency: "USDC",
    amount: "1",
    maximumStep: 24,
    maximumPayableStep: 24,
    liquidityCrashStep: null,
    currentStep: 3,
    attemptedSteps: 3,
    currentMultiplier: "1.86",
    potentialPayout: "1.86",
    maximumPayout: "100",
    reservedNetLiability: "0",
    payout: "1.86",
    serverSeedCommitment: "0xcommit",
    serverSeed: "0xseed",
    clientSeed: "web-1",
    algorithmVersion: "v1",
    rtpBasisPoints: 9_700,
    version: 4,
    steps: [],
    startedAt: "2026-09-24T10:00:00.000Z",
    settledAt: "2026-09-24T10:01:00.000Z",
    ...over,
  };
}

describe("chess", () => {
  it("reports a win as the player's own stake returning, keyed on the match id", () => {
    expect(chessShineEvent(chessMatch(), "w")).toEqual({
      service: "arcade",
      id: "chess:match-1",
      game: "Chess",
      outcome: "won",
      pnl: "+80%",
    });
  });

  it("posts nothing for the seat that lost", () => {
    expect(chessShineEvent(chessMatch(), "b")).toBeNull();
  });

  it("posts nothing for a spectator, including of a drawn game", () => {
    expect(chessShineEvent(chessMatch(), null)).toBeNull();
    expect(
      chessShineEvent(chessMatch({ result: { kind: "draw", reason: "agreement" } }), null)
    ).toBeNull();
  });

  it("reports a draw as drawn, with no return to state", () => {
    expect(
      chessShineEvent(chessMatch({ result: { kind: "draw", reason: "agreement" } }), "w")
    ).toEqual({
      service: "arcade",
      id: "chess:match-1",
      game: "Chess",
      outcome: "drawn",
      pnl: null,
    });
  });

  it("posts nothing for an aborted or unfinished match", () => {
    expect(chessShineEvent(chessMatch({ state: "cancelled" }), "w")).toBeNull();
    expect(chessShineEvent(chessMatch({ state: "in_progress" }), "w")).toBeNull();
    expect(chessShineEvent(chessMatch({ result: null }), "w")).toBeNull();
  });

  it("states no percentage on a free game, and none when the fee was never snapshotted", () => {
    expect(chessShineEvent(chessMatch({ stakeUsdc: null }), "w")).toMatchObject({ pnl: null });
    expect(chessShineEvent(chessMatch({ wagerFeeBps: null }), "w")).toMatchObject({ pnl: null });
  });

  it("reads the engine's own quote while the money flip is still outstanding", () => {
    const computer = {
      player: "bot",
      name: "Stockfish",
      bot: true,
      countryCode: null,
      rating: 1500,
      side: "black" as const,
      level: 4,
      coachEnabled: false,
      hintsUsed: 0,
      wager: {
        stakeUsdc: "1",
        houseExposureUsdc: "1.5",
        potentialPayoutUsdc: "2.5",
        feeBps: 500,
        status: "active",
        // Empty until the wager settles, which is after the result arrives.
        payoutUsdc: "0",
      },
    };
    expect(chessShineEvent(chessMatch({ computer }), "w")).toMatchObject({ pnl: "+150%" });
    expect(
      chessShineEvent(
        chessMatch({ computer: { ...computer, wager: { ...computer.wager, payoutUsdc: "2" } } }),
        "w"
      )
    ).toMatchObject({ pnl: "+100%" });
  });
});

describe("draughts", () => {
  it("reports a win under the catalogue's name for the game", () => {
    expect(draughtsShineEvent(draughtsMatch(), "white")).toEqual({
      service: "arcade",
      id: "checkers:draughts-1",
      game: "Checkers",
      outcome: "won",
      pnl: "+80%",
    });
  });

  it("posts nothing for the loser, the spectator or a cancelled match", () => {
    expect(draughtsShineEvent(draughtsMatch(), "black")).toBeNull();
    expect(draughtsShineEvent(draughtsMatch(), null)).toBeNull();
    expect(draughtsShineEvent(draughtsMatch({ state: "cancelled" }), "white")).toBeNull();
  });

  it("reports a draw as drawn for either seat", () => {
    const drawn = draughtsMatch({ result: { kind: "draw", reason: "repetition" } });
    expect(draughtsShineEvent(drawn, "black")).toMatchObject({ outcome: "drawn", pnl: null });
  });
});

describe("the vault", () => {
  it("keys on the round number, which is the only id all three paths hold", () => {
    expect(vaultShineEvent(184)).toEqual({
      service: "arcade",
      id: "last-standing:184",
      game: "The Last Man",
      outcome: "won",
      // A round has no single stake and the screen's prize is a float dollar
      // estimate, so there is no percentage to state.
      pnl: null,
    });
  });
});

describe("ArkBall", () => {
  const now = Date.parse("2026-09-24T10:30:00.000Z");

  it("reports a freshly settled winning ticket, keyed on the ticket id", () => {
    expect(arkballShineEvent(ticket(), now)).toEqual({
      service: "arcade",
      id: "arkball:ticket-1",
      game: "ArkBall",
      outcome: "won",
      pnl: "+4,900%",
    });
  });

  it("posts nothing for a ticket that did not win", () => {
    expect(arkballShineEvent(ticket({ status: "lost" }), now)).toBeNull();
    expect(arkballShineEvent(ticket({ status: "active" }), now)).toBeNull();
    expect(arkballShineEvent(ticket({ status: "refunded" }), now)).toBeNull();
  });

  it("posts nothing for a win marked without a settlement", () => {
    expect(arkballShineEvent(ticket({ settledAt: null }), now)).toBeNull();
    expect(arkballShineEvent(ticket({ settledAt: "not a date" }), now)).toBeNull();
  });

  it("posts nothing for history, which is what the tickets poll is mostly made of", () => {
    const stale = new Date(now - ARKBALL_FRESH_WIN_MS - 1_000).toISOString();
    expect(arkballShineEvent(ticket({ settledAt: stale }), now)).toBeNull();
    const justInside = new Date(now - ARKBALL_FRESH_WIN_MS + 1_000).toISOString();
    expect(arkballShineEvent(ticket({ settledAt: justInside }), now)).not.toBeNull();
  });
});

describe("Arkjet and Pilot Chicken", () => {
  it("reports a cash-out that paid more than it staked", () => {
    expect(arkjetShineEvent(arkjetBet())).toEqual({
      service: "arcade",
      id: "arkjet:bet-1",
      game: "Arkjet",
      outcome: "won",
      pnl: "+150%",
    });
    expect(chickenShineEvent(chickenSession())).toEqual({
      service: "arcade",
      id: "chicken:chicken-1",
      game: "Pilot Chicken",
      outcome: "won",
      pnl: "+86%",
    });
  });

  it("posts nothing for a crash, a cancellation or a break-even press", () => {
    expect(arkjetShineEvent(arkjetBet({ status: "LOST", payout: "0" }))).toBeNull();
    expect(arkjetShineEvent(arkjetBet({ status: "CANCELLED", payout: null }))).toBeNull();
    expect(arkjetShineEvent(arkjetBet({ payout: "5" }))).toBeNull();
    expect(chickenShineEvent(chickenSession({ status: "lost", payout: "0" }))).toBeNull();
    expect(chickenShineEvent(chickenSession({ status: "active", payout: null }))).toBeNull();
    expect(chickenShineEvent(chickenSession({ payout: "1" }))).toBeNull();
  });
});
