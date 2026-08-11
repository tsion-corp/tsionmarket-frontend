import { describe, expect, it } from "vitest";
import { toBetSlip, toMarketOdds } from "@/features/casino/lib/api/betting-wire";
import {
  estimatePariMutuelReturn,
  impliedProbability,
  pariMutuelBreakdown,
} from "@/features/casino/lib/betting-math";
import type { MarketOdds } from "@/features/casino/lib/api/types";

describe("toMarketOdds", () => {
  it("maps the map form and derives odds from pools when none are sent", () => {
    const odds = toMarketOdds({
      status: "open",
      total: "100",
      pools: { white: "40", draw: "10", black: "50" },
    });
    expect(odds.status).toBe("open");
    expect(odds.total).toBe("100");
    // total / pool: 100/40, 100/10, 100/50
    expect(odds.outcomes.white.odds).toBeCloseTo(2.5, 6);
    expect(odds.outcomes.draw.odds).toBeCloseTo(10, 6);
    expect(odds.outcomes.black.odds).toBeCloseTo(2, 6);
    expect(odds.outcomes.white.pool).toBe("40");
  });

  it("prefers server-sent odds over derived ones", () => {
    const odds = toMarketOdds({
      total: "100",
      pools: { white: "40" },
      odds: { white: "3.1" },
    });
    expect(odds.outcomes.white.odds).toBeCloseTo(3.1, 6);
  });

  it("reports null odds for an empty pool", () => {
    const odds = toMarketOdds({ total: "50", pools: { white: "50", draw: "0", black: "0" } });
    expect(odds.outcomes.draw.odds).toBeNull();
    expect(odds.outcomes.black.odds).toBeNull();
  });

  it("maps the list form and snake_case settlement fields", () => {
    const odds = toMarketOdds({
      status: "settled",
      total: "30",
      outcomes: [
        { outcome: "white", pool: "20", odds: 1.5 },
        { outcome: "black", pool: "10" },
      ],
      winning_outcome: "white",
    });
    expect(odds.outcomes.white.odds).toBeCloseTo(1.5, 6);
    expect(odds.outcomes.black.odds).toBeCloseTo(3, 6); // derived 30/10
    expect(odds.winningOutcome).toBe("white");
  });

  it("carries a void reason and defaults an unknown status to open", () => {
    const odds = toMarketOdds({ status: "weird", total: "0", void_reason: "one-sided pool" });
    expect(odds.status).toBe("open");
    expect(odds.voidReason).toBe("one-sided pool");
  });
});

describe("toBetSlip", () => {
  it("maps a won bet with a payout", () => {
    const bet = toBetSlip({
      id: "b1",
      matchId: "m1",
      outcome: "black",
      stakeUsdc: "5",
      status: "won",
      payoutUsdc: "9.5",
      createdAt: "2026-07-31T18:00:00Z",
    });
    expect(bet).toEqual({
      id: "b1",
      matchId: "m1",
      selection: "black",
      stakeUsdc: "5",
      state: "won",
      payoutUsdc: "9.5",
      placedAt: "2026-07-31T18:00:00Z",
    });
  });

  it("defaults an active bet with no payout and tolerates snake_case", () => {
    const bet = toBetSlip({ id: "b2", match_id: "m1", selection: "draw", stake_usdc: "2" });
    expect(bet.state).toBe("active");
    expect(bet.payoutUsdc).toBeNull();
    expect(bet.matchId).toBe("m1");
    expect(bet.stakeUsdc).toBe("2");
  });
});

const market: MarketOdds = {
  status: "open",
  total: "100",
  outcomes: {
    white: { pool: "40", odds: 2.5 },
    draw: { pool: "10", odds: 10 },
    black: { pool: "50", odds: 2 },
  },
  winningOutcome: null,
  voidReason: null,
};

describe("estimatePariMutuelReturn", () => {
  it("returns stake plus a raked, diluted share of the losing pools", () => {
    // Stake 10 on white: poolAfter 50, losing pools 60, 5% rake.
    // 10 + (10/50) * 60 * 0.95 = 10 + 11.4 = 21.4
    expect(estimatePariMutuelReturn(10, market, "white", 0.05)).toBeCloseTo(21.4, 6);
  });

  it("is zero for a non-positive stake", () => {
    expect(estimatePariMutuelReturn(0, market, "white", 0.05)).toBe(0);
  });
});

describe("impliedProbability", () => {
  it("is the outcome's pool share of the total", () => {
    expect(impliedProbability(market, "white")).toBeCloseTo(40, 6);
    expect(impliedProbability(market, "black")).toBeCloseTo(50, 6);
  });

  it("is zero when the market is empty", () => {
    const empty: MarketOdds = { ...market, total: "0" };
    expect(impliedProbability(empty, "white")).toBe(0);
  });
});

describe("pariMutuelBreakdown", () => {
  function market(white: string, black: string, draw: string): MarketOdds {
    const total = Number(white) + Number(black) + Number(draw);
    return {
      status: "open",
      total: String(total),
      outcomes: {
        white: { pool: white, odds: null },
        draw: { pool: draw, odds: null },
        black: { pool: black, odds: null },
      },
      winningOutcome: null,
      voidReason: null,
    };
  }

  it("agrees with the service's own settlement example", () => {
    // The service's reference case (betting/settlement.rs): white backers hold
    // 600 between them, losers hold 400, rake is 5%. A bettor putting 400 into
    // a white pool that already holds 200 is credited 400 + 253 there, so the
    // estimate shown before staking must land on the same figure.
    const odds = market("200", "300", "100");
    const result = pariMutuelBreakdown(400, odds, "white", 500);

    expect(result.stake).toBe(400);
    // 400/600 of (400 - 20 rake) = 253.33…, which the service floors to 253.
    expect(result.profit).toBeCloseTo(253.333, 3);
    expect(result.total).toBeCloseTo(653.333, 3);
    expect(result.refundOnly).toBe(false);
  });

  it("never rakes the winner's own stake", () => {
    const odds = market("0", "100", "0");
    const result = pariMutuelBreakdown(100, odds, "white", 500);
    // Losing pool is 100, so rake is 5 and the whole remaining 95 is this
    // bettor's, since they are the only winner. The 100 they staked comes back
    // untouched on top.
    expect(result.stake).toBe(100);
    expect(result.profit).toBeCloseTo(95, 6);
    expect(result.rake).toBeCloseTo(5, 6);
    expect(result.total).toBeCloseTo(195, 6);
  });

  it("reports a one-sided pool as a full refund rather than a win", () => {
    // Nobody has backed anything else, so there is nothing to be paid from.
    // The service voids the market and refunds every stake with no rake.
    const result = pariMutuelBreakdown(50, market("120", "0", "0"), "white", 500);
    expect(result.refundOnly).toBe(true);
    expect(result.total).toBe(50);
    expect(result.profit).toBe(0);
    expect(result.rake).toBe(0);
  });

  it("pays more for a bigger stake, but less than proportionally", () => {
    // Staking into a pool that already has winners in it dilutes your own
    // share: doubling the stake raises the profit without doubling it, because
    // the winning pool you are splitting grows by exactly what you put in.
    const odds = market("100", "300", "0");
    const small = pariMutuelBreakdown(100, odds, "white", 500);
    const large = pariMutuelBreakdown(200, odds, "white", 500);

    expect(large.profit).toBeGreaterThan(small.profit);
    expect(large.profit).toBeLessThan(small.profit * 2);
    // 100/200 of 285 = 142.5 against 200/300 of 285 = 190.
    expect(small.profit).toBeCloseTo(142.5, 6);
    expect(large.profit).toBeCloseTo(190, 6);
  });

  it("gives a sole winner the whole losing pool whatever they stake", () => {
    // With no other winners the share is 1 regardless of size, so the profit is
    // the losing pool net of rake either way. Only the stake returned differs.
    const odds = market("0", "300", "0");
    expect(pariMutuelBreakdown(100, odds, "white", 500).profit).toBeCloseTo(285, 6);
    expect(pariMutuelBreakdown(200, odds, "white", 500).profit).toBeCloseTo(285, 6);
  });

  it("returns nothing for a zero or negative stake", () => {
    expect(pariMutuelBreakdown(0, market("10", "10", "0"), "white", 500).total).toBe(0);
    expect(pariMutuelBreakdown(-5, market("10", "10", "0"), "white", 500).total).toBe(0);
  });

  it("honours a rake other than the 5% default", () => {
    const odds = market("0", "100", "0");
    expect(pariMutuelBreakdown(100, odds, "white", 0).profit).toBeCloseTo(100, 6);
    expect(pariMutuelBreakdown(100, odds, "white", 1000).profit).toBeCloseTo(90, 6);
  });
});
