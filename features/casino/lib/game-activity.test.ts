import { describe, expect, it } from "vitest";
import {
  chessMatchesToEntries,
  draughtsMatchesToEntries,
  lotteryTicketsToEntries,
} from "@/features/casino/lib/game-activity";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";

const ME = "0xME00000000000000000000000000000000000001";
const OPP = "0xOPP0000000000000000000000000000000000002";

// Only the fields the normalizer reads; the rest of the match shape is irrelevant.
function chess(over: Partial<ChessMatch>): ChessMatch {
  return {
    id: "m1",
    state: "settled",
    result: { kind: "checkmate", winner: "w" },
    stakeUsdc: "5",
    white: { walletAddress: ME },
    black: { walletAddress: OPP },
    createdAt: "2026-08-20T00:00:00.000Z",
    ...over,
  } as unknown as ChessMatch;
}

function draughts(over: Partial<DraughtsMatch>): DraughtsMatch {
  return {
    id: "d1",
    state: "settled",
    result: { kind: "win", winner: "white", reason: "no_moves" },
    wager: { stakeUsdc: "5", feeBps: 500, status: "settled", winnerPlayer: ME },
    white: { walletAddress: ME },
    black: { walletAddress: OPP },
    createdAt: "2026-08-20T00:00:00.000Z",
    ...over,
  } as unknown as DraughtsMatch;
}

function ticket(over: Partial<LotteryTicket>): LotteryTicket {
  return {
    id: "t1",
    drawId: "draw1",
    player: ME,
    receiptHash: "0xr",
    priceUsdc: "1",
    whiteNumbers: [1, 2, 3, 4, 5],
    powerNumber: 6,
    status: "lost",
    payoutUsdc: "0",
    acceptedAt: "2026-08-20T00:00:00.000Z",
    settledAt: "2026-08-20T12:00:00.000Z",
    ...over,
  } as LotteryTicket;
}

describe("chess matches → activity", () => {
  it("names a staked win for the winner, with the opponent", () => {
    const [e] = chessMatchesToEntries([chess({})], ME);
    expect(e.kind).toBe("won_chess");
    expect(e.direction).toBe("in");
    expect(e.amount).toBe(5);
    expect(e.counterparty).toBe(OPP);
    expect(e.symbol).toBe("USD");
  });

  it("names a loss for the other seat", () => {
    // White (ME) won by checkmate, so from OPP's side it is a loss.
    const [e] = chessMatchesToEntries([chess({})], OPP);
    expect(e.kind).toBe("lost_chess");
    expect(e.direction).toBe("out");
    expect(e.amount).toBe(5);
    expect(e.counterparty).toBe(ME);
  });

  it("marks a draw with no amount", () => {
    const [e] = chessMatchesToEntries(
      [chess({ result: { kind: "draw", reason: "agreement" } })],
      ME
    );
    expect(e.kind).toBe("drew_chess");
    expect(e.amount).toBe(0);
  });

  it("skips free games, unsettled games, and games the wallet did not play", () => {
    expect(chessMatchesToEntries([chess({ stakeUsdc: null })], ME)).toHaveLength(0);
    expect(chessMatchesToEntries([chess({ state: "in_progress" })], ME)).toHaveLength(0);
    expect(chessMatchesToEntries([chess({})], "0xstranger")).toHaveLength(0);
  });
});

describe("draughts matches → activity", () => {
  it("names a staked checkers win", () => {
    const [e] = draughtsMatchesToEntries([draughts({})], ME);
    expect(e.kind).toBe("won_checkers");
    expect(e.direction).toBe("in");
    expect(e.amount).toBe(5);
    expect(e.counterparty).toBe(OPP);
  });

  it("skips a free game (no wager)", () => {
    expect(draughtsMatchesToEntries([draughts({ wager: null })], ME)).toHaveLength(0);
  });
});

describe("ArkBall tickets → activity", () => {
  it("shows a purchase as money out and a win as money in", () => {
    const entries = lotteryTicketsToEntries([
      ticket({ id: "t1", status: "lost", priceUsdc: "1" }),
      ticket({ id: "t2", status: "won", payoutUsdc: "50" }),
    ]);
    expect(entries).toHaveLength(2);
    const bought = entries.find((e) => e.kind === "arkball_ticket")!;
    expect(bought.direction).toBe("out");
    expect(bought.amount).toBe(1);
    const won = entries.find((e) => e.kind === "arkball_won")!;
    expect(won.direction).toBe("in");
    expect(won.amount).toBe(50);
  });

  it("drops a refunded ticket (nets to zero)", () => {
    expect(lotteryTicketsToEntries([ticket({ status: "refunded" })])).toHaveLength(0);
  });
});
