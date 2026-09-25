import { describe, expect, it } from "vitest";
import { classifyPerps } from "@/features/trade/lib/migration-adapter";
import type { OpenPosition, PerpOrder, PerpPair, PerpPrice } from "@/lib/perp/types";

const NOW = 1_700_000_000;

const pairs: PerpPair[] = [
  {
    pairIndex: 0,
    from: "ETH",
    to: "USD",
    groupIndex: 0,
    group: "crypto",
    category: "crypto",
    feeIndex: 0,
    maxLeverage: 100,
  },
  {
    pairIndex: 7,
    from: "EUR",
    to: "USD",
    groupIndex: 1,
    group: "forex",
    category: "forex",
    feeIndex: 1,
    maxLeverage: 50,
  },
] as PerpPair[];

function position(overrides: Partial<OpenPosition>): OpenPosition {
  return {
    trader: "0xOld",
    pairIndex: 0,
    index: 0,
    initialCollateralUsdc: "25.5",
    openPrice: "3000",
    isLong: true,
    leverage: "5",
    takeProfit: "0",
    stopLoss: "0",
    unrealizedPnlUsdc: "-1.25",
    ...overrides,
  };
}

function order(overrides: Partial<PerpOrder>): PerpOrder {
  return {
    trader: "0xOld",
    pairIndex: 0,
    index: 3,
    isLong: false,
    collateralUsdc: "10",
    leverage: "3",
    price: "2900",
    takeProfit: "0",
    stopLoss: "0",
    slippagePct: "1",
    ...overrides,
  };
}

describe("classifyPerps", () => {
  it("lists positions as opt-in, irreversible, valued at collateral plus PnL", () => {
    const [h] = classifyPerps({
      positions: [position({})],
      orders: [],
      pairs,
      prices: [],
      nowSeconds: NOW,
    });

    expect(h.id).toBe("perps:position:0:0");
    expect(h.kind).toBe("position");
    expect(h.label).toBe("ETH/USD long 5x");
    expect(h.amount).toBe(25_500_000n);
    expect(h.valueUsd).toBeCloseTo(24.25);
    expect(h.deterministic).toBe(false);
    expect(h.irreversible).toBe(true);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("lists resting orders as opt-in but not irreversible", () => {
    const [h] = classifyPerps({
      positions: [],
      orders: [order({})],
      pairs,
      prices: [],
      nowSeconds: NOW,
    });

    expect(h.id).toBe("perps:order:0:3");
    expect(h.kind).toBe("order");
    expect(h.amount).toBe(10_000_000n);
    expect(h.deterministic).toBe(false);
    expect(h.irreversible).toBe(false);
  });

  it("strands a position on a market whose feed has gone stale", () => {
    const prices: PerpPrice[] = [
      { pairIndex: 7, pair: "EUR/USD", price: "1.08", publishTime: NOW - 3600 },
    ];
    const [h] = classifyPerps({
      positions: [position({ pairIndex: 7 })],
      orders: [],
      pairs,
      prices,
      nowSeconds: NOW,
    });

    expect(h.settleability).toEqual({ state: "stranded", reason: "closedMarket" });
  });

  it("never strands crypto, which trades around the clock", () => {
    const [h] = classifyPerps({
      positions: [position({})],
      orders: [],
      pairs,
      prices: [],
      nowSeconds: NOW,
    });
    expect(h.settleability.state).toBe("now");
  });
});
