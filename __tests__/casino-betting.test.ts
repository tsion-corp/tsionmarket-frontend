import { describe, expect, it } from "vitest";
import { toBetSlip, toMarketOdds } from "@/lib/casino/api/betting-wire";
import { estimatePariMutuelReturn, impliedProbability } from "@/lib/casino/betting-math";
import type { MarketOdds } from "@/lib/casino/api/types";

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
