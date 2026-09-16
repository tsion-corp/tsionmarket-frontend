import { describe, expect, it } from "vitest";
import {
  heldAssetCount,
  portfolioBreakdown,
  readyToSpendUsd,
} from "@/features/portfolio/lib/breakdown";
import type { TokenBalance } from "@/lib/server/alchemy";

function token(kind: TokenBalance["kind"], valueUsd: number, symbol = "X"): TokenBalance {
  return {
    symbol,
    name: symbol,
    network: "base-mainnet",
    address: null,
    decimals: 6,
    kind,
    balance: valueUsd,
    rawBalance: String(valueUsd),
    priceUsd: 1,
    valueUsd,
    logo: null,
  };
}

describe("readyToSpendUsd", () => {
  it("counts only the stablecoins a purchase can draw on", () => {
    // The mobile app's "$125.08 ready to spend" against a $204.09 total.
    const tokens = [token("stablecoin", 125.08), token("token", 79.01)];
    expect(readyToSpendUsd(tokens)).toBeCloseTo(125.08, 6);
  });

  it("adds stablecoins across chains", () => {
    expect(readyToSpendUsd([token("stablecoin", 10), token("stablecoin", 2.5)])).toBe(12.5);
  });

  it("is zero for a portfolio with value but nothing spendable", () => {
    expect(readyToSpendUsd([token("rwa", 500), token("coin", 20)])).toBe(0);
  });
});

describe("portfolioBreakdown", () => {
  it("groups by kind, largest first, sharing out of the total", () => {
    const slices = portfolioBreakdown([
      token("stablecoin", 125.08),
      token("token", 79.01),
      token("coin", 20),
    ]);
    expect(slices.map((s) => s.key)).toEqual(["cash", "tokens", "coins"]);
    expect(slices.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 10);
    expect(slices[0].share).toBeCloseTo(125.08 / 224.09, 10);
  });

  it("merges holdings of the same kind and counts them", () => {
    const slices = portfolioBreakdown([token("stablecoin", 6), token("stablecoin", 4)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].valueUsd).toBe(10);
    expect(slices[0].count).toBe(2);
  });

  it("drops worthless holdings rather than drawing a zero-width arc", () => {
    const slices = portfolioBreakdown([token("stablecoin", 10), token("token", 0)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].share).toBe(1);
  });

  it("returns nothing for an empty or worthless portfolio", () => {
    expect(portfolioBreakdown([])).toEqual([]);
    expect(portfolioBreakdown([token("token", 0)])).toEqual([]);
  });
});

describe("heldAssetCount", () => {
  it("counts only holdings worth something", () => {
    expect(heldAssetCount([token("stablecoin", 10), token("token", 0), token("coin", 1)])).toBe(2);
  });
});

/**
 * Dust in the allocation drawer.
 *
 * A slice worth less than a cent can only be drawn as "<$0.01" at 0%, which
 * describes nothing and, after a full exit, reads as though the sale never
 * happened. The holdings list already drops these positions, so the drawer that
 * sits beside it must not still be counting them.
 */
describe("dust in the allocation", () => {
  it("leaves a sub-cent position out of the slices", () => {
    const tokens = [
      token("stablecoin", 3.87),
      token("coin", 0.06),
      // The reported case: remainders left behind after selling the position.
      token("token", 0.004),
      token("rwa", 0.0042),
    ];
    const slices = portfolioBreakdown(tokens);
    expect(slices.map((slice) => slice.key)).toEqual(["cash", "coins"]);
  });

  it("leaves the surviving shares adding up", () => {
    const tokens = [token("stablecoin", 3.87), token("coin", 0.06), token("token", 0.004)];
    const total = portfolioBreakdown(tokens).reduce((sum, slice) => sum + slice.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("does not count dust as an asset in the centre of the ring", () => {
    const tokens = [
      token("stablecoin", 3.87),
      token("coin", 0.06),
      token("token", 0.004),
      token("rwa", 0.0042),
    ];
    expect(heldAssetCount(tokens)).toBe(2);
  });

  /**
   * The same carve-out the holdings list makes. valueUsd is balance x price, so
   * a real balance we could not price is $0 through no fault of the owner. It
   * has never been in the allocation, because a slice needs a value to have a
   * share, and this only pins that the dust rule did not change that.
   */
  it("still leaves an unpriced holding out, having no share to draw", () => {
    const unpriced: TokenBalance = { ...token("token", 0), balance: 4, priceUsd: 0 };
    expect(portfolioBreakdown([token("stablecoin", 10), unpriced]).map((s) => s.key)).toEqual([
      "cash",
    ]);
  });

  it("keeps a position worth exactly a cent", () => {
    const slices = portfolioBreakdown([token("stablecoin", 10), token("token", 0.01)]);
    expect(slices.map((slice) => slice.key)).toEqual(["cash", "tokens"]);
  });
});
