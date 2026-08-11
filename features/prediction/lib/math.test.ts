import { describe, expect, it } from "vitest";
import {
  applyFee,
  bigintSqrt,
  completeSetCost,
  lpValue,
  minOut,
  payout,
  priceNoFromReserves,
  priceYesFromReserves,
  quoteBuy,
  quoteSell,
} from "@/features/prediction/lib/math";

const M = 1_000_000n; // 1 unit in 6-dec base units

describe("priceYesFromReserves / priceNoFromReserves", () => {
  it("prices a balanced pool at 50/50", () => {
    expect(priceYesFromReserves(M, M)).toBe(500_000n);
    expect(priceNoFromReserves(M, M)).toBe(500_000n);
  });

  it("prices YES from the opposing reserve share", () => {
    // priceYes = rNo / (rYes + rNo) = 3/4
    expect(priceYesFromReserves(M, 3n * M)).toBe(750_000n);
    expect(priceNoFromReserves(M, 3n * M)).toBe(250_000n);
  });

  it("throws when the pool has no liquidity", () => {
    expect(() => priceYesFromReserves(0n, 0n)).toThrow();
  });
});

describe("quoteBuy", () => {
  it("buys YES on a balanced pool and keeps the product at or above k", () => {
    const q = quoteBuy(M, M, "yes", M, 0);
    expect(q.sharesOut).toBe(1_500_000n);
    expect(q.newRYes).toBe(500_000n);
    expect(q.newRNo).toBe(2_000_000n);
    expect(q.newRYes * q.newRNo).toBeGreaterThanOrEqual(M * M);
  });

  it("buys NO as the mirror of YES on a balanced pool", () => {
    const yes = quoteBuy(M, M, "yes", M, 0);
    const no = quoteBuy(M, M, "no", M, 0);
    expect(no.sharesOut).toBe(yes.sharesOut);
    expect(no.newRNo).toBe(yes.newRYes);
    expect(no.newRYes).toBe(yes.newRNo);
  });

  it("returns roughly two shares per unit at 50c for a tiny trade", () => {
    // 0.001 USDC on a deep 50/50 pool ~ 0.002 shares (price ~0.5).
    const q = quoteBuy(M, M, "yes", 1_000n, 0);
    expect(q.sharesOut).toBe(1_999n);
    expect(q.newRYes * q.newRNo).toBeGreaterThanOrEqual(M * M);
  });

  it("gives fewer shares once a fee is applied", () => {
    const free = quoteBuy(M, M, "yes", M, 0);
    const fee = quoteBuy(M, M, "yes", M, 100);
    expect(fee.sharesOut).toBeLessThan(free.sharesOut);
  });

  it("is a no-op for a zero amount", () => {
    const q = quoteBuy(M, M, "yes", 0n, 100);
    expect(q).toEqual({ sharesOut: 0n, newRYes: M, newRNo: M });
  });

  it("throws on a market with no liquidity", () => {
    expect(() => quoteBuy(0n, 0n, "yes", M, 0)).toThrow();
  });
});

describe("quoteSell", () => {
  it("sells shares back for collateral at the expected floor", () => {
    // 2000 YES shares on a deep 50/50 pool ~ 0.000999 USDC out.
    const q = quoteSell(M, M, "yes", 2_000n, 0);
    expect(q.usdcOut).toBe(999n);
  });

  it("is symmetric for YES and NO on a balanced pool", () => {
    const yes = quoteSell(M, M, "yes", 50_000n, 0);
    const no = quoteSell(M, M, "no", 50_000n, 0);
    expect(no.usdcOut).toBe(yes.usdcOut);
  });

  it("never lets a buy-then-sell round trip return more than was put in", () => {
    for (const usdcIn of [1_000n, 50_000n, 250_000n, M]) {
      const bought = quoteBuy(M, M, "yes", usdcIn, 0);
      const back = quoteSell(bought.newRYes, bought.newRNo, "yes", bought.sharesOut, 0);
      expect(back.usdcOut).toBeLessThanOrEqual(usdcIn);
    }
  });

  it("is a no-op for a zero amount", () => {
    const q = quoteSell(M, M, "yes", 0n, 100);
    expect(q).toEqual({ usdcOut: 0n, newRYes: M, newRNo: M });
  });

  it("throws on a market with no liquidity", () => {
    expect(() => quoteSell(0n, 0n, "yes", M, 0)).toThrow();
  });
});

describe("applyFee", () => {
  it("takes the fee off the input", () => {
    expect(applyFee(M, 100)).toBe(990_000n); // 1%
    expect(applyFee(M, 0)).toBe(M);
  });

  it("rejects a negative amount", () => {
    expect(() => applyFee(-1n, 100)).toThrow();
  });
});

describe("minOut", () => {
  it("floors the guard below the quote", () => {
    expect(minOut(M, 50)).toBe(995_000n); // 0.5%
    expect(minOut(M, 0)).toBe(M);
    expect(minOut(3n, 5_000)).toBe(1n); // 3 * 0.5 = 1.5 -> floor 1
  });

  it("is never looser than the quoted output", () => {
    for (const expected of [1n, 7n, 1_234n, M, 987_654_321n]) {
      for (const tol of [0, 1, 25, 50, 300, 1000]) {
        expect(minOut(expected, tol)).toBeLessThanOrEqual(expected);
      }
    }
  });

  it("rejects an out-of-range tolerance", () => {
    expect(() => minOut(M, -1)).toThrow();
    expect(() => minOut(M, 10_001)).toThrow();
  });
});

describe("completeSetCost / payout", () => {
  it("costs 1 USDC per complete set (1:1, 6-dec)", () => {
    expect(completeSetCost(5n * M)).toBe(5n * M);
  });

  it("redeems a winning share 1:1 and a losing share to zero", () => {
    expect(payout(7n * M, true)).toBe(7n * M);
    expect(payout(7n * M, false)).toBe(0n);
  });
});

describe("lpValue", () => {
  it("returns the pro-rata reserve share", () => {
    expect(lpValue(50n, 100n, M, 2n * M)).toEqual({ yesOut: 500_000n, noOut: M });
  });

  it("is zero for an empty pool or a zero position", () => {
    expect(lpValue(0n, 100n, M, M)).toEqual({ yesOut: 0n, noOut: 0n });
    expect(lpValue(10n, 0n, M, M)).toEqual({ yesOut: 0n, noOut: 0n });
  });
});

describe("bigintSqrt", () => {
  it("floors the integer square root", () => {
    expect(bigintSqrt(0n)).toBe(0n);
    expect(bigintSqrt(1n)).toBe(1n);
    expect(bigintSqrt(15n)).toBe(3n);
    expect(bigintSqrt(16n)).toBe(4n);
    expect(bigintSqrt(4_000_000_000_000n)).toBe(2_000_000n);
  });

  it("rejects a negative input", () => {
    expect(() => bigintSqrt(-1n)).toThrow();
  });
});

describe("no floats on the money path", () => {
  it("returns bigints from every quote field", () => {
    const b = quoteBuy(M, M, "yes", M, 100);
    for (const v of Object.values(b)) expect(typeof v).toBe("bigint");
    const s = quoteSell(M, M, "yes", M, 100);
    for (const v of Object.values(s)) expect(typeof v).toBe("bigint");
  });
});
