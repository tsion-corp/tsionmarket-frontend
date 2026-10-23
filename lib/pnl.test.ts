import { describe, expect, it } from "vitest";
import { closedPositions, realisedPercent, realisedPnl } from "@/lib/pnl";
import type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";

let seq = 0;
function trade(
  kind: ActivityKind,
  symbol: string,
  amount: number,
  cash: number,
  at = ++seq
): ActivityEntry {
  return {
    id: `e${at}`,
    hash: `0x${at}`,
    network: "base-mainnet",
    timestamp: at,
    kind,
    symbol,
    amount,
    direction: kind === "bought" ? "in" : "out",
    counterSymbol: "USDC",
    counterAmount: cash,
    counterparty: null,
    logo: null,
  };
}

const only = (entries: ActivityEntry[]) => realisedPnl(entries)[0];

describe("realised P&L", () => {
  it("scores a simple round trip", () => {
    const asset = only([trade("bought", "GLDx", 10, 100), trade("sold", "GLDx", 10, 150)]);
    expect(asset.realised).toBe(50);
    expect(asset.realisedCostBasis).toBe(100);
    expect(asset.quantity).toBe(0);
    expect(realisedPercent(asset)).toBe(50);
  });

  it("reports a loss as a loss", () => {
    const asset = only([trade("bought", "GLDx", 10, 100), trade("sold", "GLDx", 10, 60)]);
    expect(asset.realised).toBe(-40);
    expect(realisedPercent(asset)).toBe(-40);
  });

  it("averages the cost of several buys before a partial sale", () => {
    // 10 @ $10 then 10 @ $20 = 20 @ $15. Selling 10 at $25 realises $100.
    const asset = only([
      trade("bought", "GLDx", 10, 100),
      trade("bought", "GLDx", 10, 200),
      trade("sold", "GLDx", 10, 250),
    ]);
    expect(asset.averageCost).toBe(15);
    expect(asset.realised).toBe(100);
    expect(asset.quantity).toBe(10);
  });

  it("uses chronological order, not the order it was handed", () => {
    const buy = trade("bought", "GLDx", 10, 100, 1);
    const sell = trade("sold", "GLDx", 10, 150, 2);
    expect(only([sell, buy]).realised).toBe(50);
  });

  /**
   * The most flattering lie this module could tell is calling a sale with no
   * cost basis pure profit. A position bought outside Ark and sold here has no
   * purchase in this data at all.
   */
  it("never scores a sale it cannot account for", () => {
    const asset = only([trade("sold", "GLDx", 10, 150)]);
    expect(asset.realised).toBe(0);
    expect(asset.realisedCostBasis).toBe(0);
    expect(asset.unbackedQuantity).toBe(10);
  });

  it("scores only the backed part of an oversized sale", () => {
    // Bought 4 for $40, sold 10 for $200. Only the 4 we can account for score.
    const asset = only([trade("bought", "GLDx", 4, 40), trade("sold", "GLDx", 10, 200)]);
    expect(asset.realised).toBe(40); // proceeds 80 on 4 units, cost 40
    expect(asset.unbackedQuantity).toBe(6);
  });

  it("ignores asset-to-asset swaps, which realise against a price we were not told", () => {
    const swap = trade("sold", "GLDx", 10, 150);
    swap.counterSymbol = "ETH";
    expect(only([trade("bought", "GLDx", 10, 100), swap]).realised).toBe(0);
  });

  it("does not treat spending a stablecoin as a position", () => {
    expect(realisedPnl([trade("sold", "USDC", 100, 100)])).toEqual([]);
  });

  it("keeps assets separate", () => {
    const result = realisedPnl([
      trade("bought", "GLDx", 10, 100),
      trade("sold", "GLDx", 10, 150),
      trade("bought", "ETH", 1, 1000),
      trade("sold", "ETH", 1, 900),
    ]);
    expect(result.find((a) => a.symbol === "GLDx")?.realised).toBe(50);
    expect(result.find((a) => a.symbol === "ETH")?.realised).toBe(-100);
  });
});

describe("closedPositions", () => {
  it("shows only assets something was actually sold from", () => {
    const result = closedPositions([
      trade("bought", "HELD", 10, 100),
      trade("bought", "GLDx", 10, 100),
      trade("sold", "GLDx", 10, 150),
    ]);
    expect(result.map((a) => a.symbol)).toEqual(["GLDx"]);
  });

  it("leads with the biggest result, win or loss", () => {
    const result = closedPositions([
      trade("bought", "SMALL", 10, 100),
      trade("sold", "SMALL", 10, 110),
      trade("bought", "BIG", 10, 100),
      trade("sold", "BIG", 10, 20),
    ]);
    expect(result.map((a) => a.symbol)).toEqual(["BIG", "SMALL"]);
  });

  it("returns no percentage when nothing was backed", () => {
    expect(
      realisedPercent({
        symbol: "X",
        quantity: 0,
        averageCost: 0,
        realised: 0,
        realisedCostBasis: 0,
        unbackedQuantity: 5,
      })
    ).toBeNull();
  });
});
