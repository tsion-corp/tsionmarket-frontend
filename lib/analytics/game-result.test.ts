import { describe, expect, it } from "vitest";
import { gamePayout } from "@/lib/analytics/game-result";

describe("gamePayout", () => {
  it("pays the winner the pot less the platform cut", () => {
    // Both seats staked 10, so the pot is 20 and the 5% cut is 1.
    expect(gamePayout("10", "win", 500)).toEqual({
      stake_usd: 10,
      payout_usd: 19,
      fee_usd: 1,
    });
  });

  it("refunds a draw in full and takes no cut", () => {
    expect(gamePayout("10", "draw", 500)).toEqual({
      stake_usd: 10,
      payout_usd: 10,
      fee_usd: 0,
    });
  });

  it("pays a loss nothing, and charges it no fee", () => {
    // The cut comes out of the winnings, so it is only ever reported against
    // the seat that collected.
    expect(gamePayout("10", "loss", 500)).toEqual({
      stake_usd: 10,
      payout_usd: 0,
      fee_usd: 0,
    });
  });

  it("settles an unstaked game for nothing on every side", () => {
    expect(gamePayout(null, "win", 500)).toEqual({ stake_usd: 0, payout_usd: 0, fee_usd: 0 });
    expect(gamePayout("0", "win", 500)).toEqual({ stake_usd: 0, payout_usd: 0, fee_usd: 0 });
  });

  it("honours a cut other than 5%", () => {
    expect(gamePayout("10", "win", 0)).toEqual({ stake_usd: 10, payout_usd: 20, fee_usd: 0 });
    expect(gamePayout("10", "win", 1000)).toEqual({ stake_usd: 10, payout_usd: 18, fee_usd: 2 });
  });

  it("treats an unparseable stake as unstaked rather than NaN", () => {
    expect(gamePayout("not-a-number", "win", 500)).toEqual({
      stake_usd: 0,
      payout_usd: 0,
      fee_usd: 0,
    });
  });
});
