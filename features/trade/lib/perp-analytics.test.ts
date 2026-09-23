import { describe, expect, it } from "vitest";
import {
  perpClosedProps,
  perpOpenedProps,
  perpOrderProps,
} from "@/features/trade/lib/perp-analytics";
import type { HlOrderRow, HlPositionView } from "@/features/trade/lib/hyperliquid-types";

// The Hyperliquid desk reported nothing: perp_trade_opened and _closed were
// wired to the old venue and never moved across. These shape what the new desk
// sends, from the order it placed and what the exchange said about it.

const entry = (over: Partial<HlOrderRow> = {}): HlOrderRow => ({
  id: "ord-1",
  walletId: "w1",
  assetId: "asset-btc",
  cloid: "c1",
  externalOrderId: "901",
  parentOrderId: null,
  orderType: "market",
  side: "buy",
  size: "0.0156",
  limitPrice: null,
  reduceOnly: false,
  status: "filled",
  ...over,
});

describe("perpOpenedProps", () => {
  const order = {
    market: "BTC",
    side: "buy" as const,
    orderMode: "market" as const,
    leverage: 10,
    marginMode: "cross" as const,
    collateralUsd: 100,
    notionalUsd: 1000,
    markPrice: 64000,
    limitPrice: "",
    takeProfitPrice: "70000",
    stopLossPrice: "",
  };

  it("reports the position it opened, with its notional as collateral times leverage", () => {
    expect(perpOpenedProps(order, entry())).toEqual({
      pair: "BTC",
      direction: "long",
      leverage: 10,
      margin_mode: "cross",
      collateral_usd: 100,
      notional_usd: 1000,
      order_type: "market",
      entry_price: 64000,
      take_profit: 70000,
      order_id: "ord-1",
      venue: "hyperliquid",
      amount_source: "quote",
    });
  });

  it("leaves an exit out entirely rather than reporting it at no price", () => {
    // A zero stop loss would read as an exit set at $0, which is a level the
    // user never chose.
    expect(perpOpenedProps(order, entry())).not.toHaveProperty("stop_loss");
  });

  it("reports the order as submitted before the venue has answered", () => {
    // Same shape as the open, minus anything only the fill knows: an order
    // that never comes back is still counted.
    expect(perpOrderProps(order)).toEqual({
      pair: "BTC",
      direction: "long",
      leverage: 10,
      margin_mode: "cross",
      collateral_usd: 100,
      notional_usd: 1000,
      order_type: "market",
      take_profit: 70000,
      venue: "hyperliquid",
    });
  });

  it("reports a resting limit order at its limit, with no entry price yet", () => {
    const props = perpOpenedProps(
      { ...order, side: "sell", orderMode: "limit", limitPrice: "66000" },
      entry({ orderType: "limit", status: "open", limitPrice: "66000" })
    );
    expect(props).toMatchObject({ direction: "short", order_type: "limit", limit_price: 66000 });
    expect(props).not.toHaveProperty("entry_price");
  });

  it("reports nothing for an order the exchange rejected", () => {
    expect(perpOpenedProps(order, entry({ status: "rejected" }))).toBeNull();
    expect(perpOpenedProps(order, entry({ status: "cancelled" }))).toBeNull();
  });
});

describe("perpClosedProps", () => {
  const position = {
    id: "pos-1",
    assetId: "asset-btc",
    side: "long",
    size: "0.0156",
    entryPrice: "64000",
    leverage: 10,
    markPrice: "65000",
    unrealizedPnlUsdc: "15.6",
  } as HlPositionView;

  it("reports a manual close at the mark, with the PnL the position showed", () => {
    expect(perpClosedProps(position, "BTC", entry({ id: "close-1", orderType: "close" }))).toEqual({
      pair: "BTC",
      direction: "long",
      position_id: "pos-1",
      close_type: "full",
      close_reason: "manual",
      exit_price: 65000,
      pnl_usd: 15.6,
      notional_usd: 1014,
      order_id: "close-1",
      venue: "hyperliquid",
      amount_source: "quote",
    });
  });
});
