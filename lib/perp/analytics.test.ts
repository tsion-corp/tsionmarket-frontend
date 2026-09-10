import { describe, expect, it } from "vitest";
import { orderKind, perpMarketName, perpOpenedProps } from "@/lib/perp/analytics";
import type { OpenTradeRequest, PerpPair } from "@/lib/perp/types";

const pair = (pairIndex: number, from: string): PerpPair =>
  ({ pairIndex, from, to: "USD" }) as PerpPair;

const PAIRS = [pair(0, "ETH"), pair(1, "BTC"), pair(12, "SOL")];

const request = (over: Partial<Omit<OpenTradeRequest, "trader">> = {}) =>
  ({
    pair: "ETH/USD",
    isLong: true,
    collateralUsdc: "250",
    leverage: "10",
    orderType: "market",
    openPrice: "3120.44",
    slippagePct: "1",
    ...over,
  }) as Omit<OpenTradeRequest, "trader">;

describe("perpMarketName", () => {
  it("names a market the same way an open does, so a close can be matched to it", () => {
    expect(perpMarketName(PAIRS, 12)).toBe("SOL/USD");
    expect(perpMarketName(PAIRS, 0)).toBe("ETH/USD");
  });

  it("falls back to the index rather than guessing when the pairs have not loaded", () => {
    expect(perpMarketName([], 12)).toBe("pair_12");
    expect(perpMarketName(PAIRS, 99)).toBe("pair_99");
  });
});

describe("orderKind", () => {
  it("reports the zero-fee variant as the market order it is", () => {
    expect(orderKind("market")).toBe("market");
    expect(orderKind("market_zero_fee")).toBe("market");
    expect(orderKind("limit")).toBe("limit");
    expect(orderKind("stop_limit")).toBe("stop");
  });
});

describe("perpOpenedProps", () => {
  it("reports the leveraged size, not just the collateral", () => {
    const props = perpOpenedProps(request(), false, "crypto");
    expect(props.collateral_usd).toBe(250);
    expect(props.leverage).toBe(10);
    expect(props.position_size_usd).toBe(2500);
  });

  it("maps the app's category to the catalog's, and omits one it does not cover", () => {
    expect(perpOpenedProps(request(), false, "commodities").market_type).toBe("commodity");
    expect(perpOpenedProps(request(), false, "other").market_type).toBeUndefined();
    expect(perpOpenedProps(request(), false).market_type).toBeUndefined();
  });

  it("calls a filled order's price an entry", () => {
    const props = perpOpenedProps(request(), false, "crypto");
    expect(props.entry_price).toBe(3120.44);
    expect(props.limit_price).toBeUndefined();
  });

  it("calls a resting order's price a limit, because nothing has opened yet", () => {
    const props = perpOpenedProps(request({ orderType: "limit", openPrice: "3000" }), true);
    expect(props.order_type).toBe("limit");
    expect(props.limit_price).toBe(3000);
    expect(props.entry_price).toBeUndefined();
  });

  it("treats the wire's '0' as no level set rather than a level of zero", () => {
    const props = perpOpenedProps(request({ takeProfit: "0", stopLoss: "0" }), false);
    expect(props.has_take_profit).toBe(false);
    expect(props.has_stop_loss).toBe(false);
    expect(props.take_profit_price).toBeUndefined();
    expect(props.stop_loss_price).toBeUndefined();
  });

  it("carries the exits that were actually attached", () => {
    const props = perpOpenedProps(request({ takeProfit: "3500", stopLoss: "2900" }), false);
    expect(props.has_take_profit).toBe(true);
    expect(props.take_profit_price).toBe(3500);
    expect(props.has_stop_loss).toBe(true);
    expect(props.stop_loss_price).toBe(2900);
  });

  it("reports one side set and the other not", () => {
    const props = perpOpenedProps(request({ takeProfit: "3500", stopLoss: "0" }), false);
    expect(props.has_take_profit).toBe(true);
    expect(props.has_stop_loss).toBe(false);
    expect(props.stop_loss_price).toBeUndefined();
  });

  it("reports a short as a short", () => {
    expect(perpOpenedProps(request({ isLong: false }), false).side).toBe("short");
  });
});
