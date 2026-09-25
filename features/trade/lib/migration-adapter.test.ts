import { describe, expect, it } from "vitest";
import { classifyPerps } from "@/features/trade/lib/migration-adapter";
import type { HlAsset, HlOrderRow, HlPositionView } from "@/features/trade/lib/hyperliquid-types";

const WALLET = "w-1";

const assets: HlAsset[] = [
  {
    id: "a-eth",
    assetIndex: 0,
    dex: "",
    symbol: "ETH",
    category: "crypto",
    szDecimals: 4,
    maxLeverage: 50,
    isActive: true,
  },
  {
    id: "a-gone",
    assetIndex: 9,
    dex: "",
    symbol: "GONE",
    category: "crypto",
    szDecimals: 2,
    maxLeverage: 10,
    isActive: false,
  },
];

function position(overrides: Partial<HlPositionView>): HlPositionView {
  return {
    id: "p-1",
    walletId: WALLET,
    assetId: "a-eth",
    entryOrderId: "o-0",
    side: "long",
    size: "0.1",
    entryPrice: "3000",
    leverage: 5,
    marginMode: "cross",
    status: "open",
    closeReason: null,
    closePrice: null,
    realizedPnlUsdc: null,
    markPrice: "2990",
    unrealizedPnlUsdc: "-1.25",
    accruedFundingUsdc: "0",
    openedAt: "2026-09-01T00:00:00Z",
    closedAt: null,
    ...overrides,
  };
}

function order(overrides: Partial<HlOrderRow>): HlOrderRow {
  return {
    id: "o-3",
    walletId: WALLET,
    assetId: "a-eth",
    cloid: "0x1",
    externalOrderId: null,
    parentOrderId: null,
    orderType: "limit",
    side: "sell",
    size: "0.2",
    limitPrice: "2900",
    reduceOnly: false,
    status: "open",
    ...overrides,
  };
}

function classify(overrides: Partial<Parameters<typeof classifyPerps>[0]>) {
  return classifyPerps({
    walletId: WALLET,
    positions: [],
    orders: [],
    assets,
    withdrawable: "0",
    strandedOnArbitrum: null,
    ...overrides,
  });
}

describe("classifyPerps", () => {
  it("lists an open position as opt-in, irreversible, valued at its margin plus PnL", () => {
    const [h] = classify({ positions: [position({})] });
    expect(h.id).toBe("perps:position:p-1");
    expect(h.kind).toBe("position");
    expect(h.label).toBe("ETH long 5x");
    // 0.1 ETH at 3000 on 5x is 60 USDC of margin.
    expect(h.amount).toBe(60_000_000n);
    expect(h.valueUsd).toBeCloseTo(58.75);
    expect(h.deterministic).toBe(false);
    expect(h.irreversible).toBe(true);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("leaves a closed position out: the mirror keeps history", () => {
    expect(classify({ positions: [position({ status: "closed" })] })).toEqual([]);
  });

  it("strands a position on a market the venue has delisted", () => {
    const [h] = classify({ positions: [position({ assetId: "a-gone" })] });
    expect(h.settleability).toEqual({ state: "stranded", reason: "closedMarket" });
  });

  it("lists a resting order to cancel, worth nothing, not irreversible", () => {
    const [h] = classify({ orders: [order({})] });
    expect(h.id).toBe("perps:order:o-3");
    expect(h.kind).toBe("order");
    expect(h.label).toBe("ETH sell limit at 2900");
    expect(h.amount).toBe(0n);
    expect(h.irreversible).toBe(false);
    expect(h.deterministic).toBe(false);
  });

  it("ignores an order that is no longer resting", () => {
    expect(
      classify({ orders: [order({ status: "filled" }), order({ status: "cancelled" })] })
    ).toEqual([]);
  });

  it("carries the withdrawable balance across on its own", () => {
    const [h] = classify({ withdrawable: "42.5" });
    expect(h.id).toBe("perps:balance:w-1");
    expect(h.kind).toBe("balance");
    expect(h.amount).toBe(42_500_000n);
    expect(h.valueUsd).toBe(42.5);
    expect(h.deterministic).toBe(true);
    expect(h.irreversible).toBe(false);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("strands a balance the venue's withdrawal fee would swallow", () => {
    const [h] = classify({ withdrawable: "1.2" });
    expect(h.settleability).toEqual({ state: "stranded", reason: "belowMinimum" });
  });

  it("lists nothing for an empty account", () => {
    expect(classify({ withdrawable: "0" })).toEqual([]);
  });

  it("offers the hop again for a withdrawal the venue still records as pending", () => {
    const [h] = classify({ strandedOnArbitrum: "10" });
    expect(h.id).toBe("perps:arbitrum:w-1");
    expect(h.kind).toBe("arbitrum");
    expect(h.amount).toBe(10_000_000n);
    expect(h.deterministic).toBe(true);
  });
});
