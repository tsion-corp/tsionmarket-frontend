// What the Hyperliquid desk reports when it opens or closes a position.
//
// The exchange's order row says whether the order stands and what it is known
// by, but not what it filled at. So the dollar figures are the ticket's own:
// collateral, and notional as collateral times leverage, or the position's size
// at its mark on a close. They are marked `amount_source: "quote"`; settled
// perp volume comes from the venue, not from the browser.
//
// Stops, take profits and liquidations execute on Hyperliquid itself and never
// pass through this app, so a close reported here is always a manual one.

import type { AnalyticsEvents, MarketType, PerpOrder } from "@/lib/analytics/events";
import type { HlOrderRow, HlPositionView } from "@/features/trade/lib/hyperliquid-types";

export interface PerpTicket {
  market: string;
  side: "buy" | "sell";
  orderMode: "market" | "limit";
  leverage: number;
  marginMode: "cross" | "isolated";
  collateralUsd: number;
  notionalUsd: number;
  markPrice: number;
  limitPrice: string;
  takeProfitPrice: string;
  stopLossPrice: string;
}

const MARKET_TYPES: Record<string, MarketType> = {
  crypto: "crypto",
  forex: "forex",
  fx: "forex",
  commodity: "commodity",
  commodities: "commodity",
  equity: "equity",
  equities: "equity",
  stocks: "equity",
};

/** A Hyperliquid asset's category as the catalog's market type, or omitted. */
export function marketTypeOf(category: string | null): MarketType | undefined {
  return category ? MARKET_TYPES[category.toLowerCase()] : undefined;
}

// An order the exchange refused or pulled opened nothing.
const DID_NOT_OPEN = new Set(["rejected", "cancelled"]);

function positive(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Which way a ticket is pointing, in the catalog's words. */
export function directionOf(side: "buy" | "sell"): "long" | "short" {
  return side === "buy" ? "long" : "short";
}

/**
 * What the ticket says about the order, shared by the submission and the open.
 *
 * These are the values actually sent to the venue, not the screen's defaults:
 * the ticket is built from what the user set, and `notional_usd` is collateral
 * times that leverage rather than a figure read back off the position.
 */
export function perpOrderProps(ticket: PerpTicket): PerpOrder {
  const takeProfit = positive(ticket.takeProfitPrice);
  const stopLoss = positive(ticket.stopLossPrice);
  const limit = ticket.orderMode === "limit" ? positive(ticket.limitPrice) : undefined;
  return {
    pair: ticket.market,
    direction: directionOf(ticket.side),
    leverage: ticket.leverage,
    margin_mode: ticket.marginMode,
    collateral_usd: ticket.collateralUsd,
    notional_usd: ticket.notionalUsd,
    order_type: ticket.orderMode,
    ...(limit !== undefined ? { limit_price: limit } : {}),
    // Omitted rather than sent as a zero, which would read as an exit set at
    // no price at all.
    ...(takeProfit !== undefined ? { take_profit: takeProfit } : {}),
    ...(stopLoss !== undefined ? { stop_loss: stopLoss } : {}),
    venue: "hyperliquid",
  };
}

/** perp_trade_opened for an order the exchange accepted, or null when it did not. */
export function perpOpenedProps(
  ticket: PerpTicket,
  entry: HlOrderRow
): AnalyticsEvents["perp_trade_opened"] | null {
  if (DID_NOT_OPEN.has(entry.status)) return null;
  const order = perpOrderProps(ticket);
  return {
    ...order,
    // A market order opens at the mark. A limit order has not opened at any
    // price yet: it is resting at the level perpOrderProps already reported.
    ...(order.limit_price === undefined ? { entry_price: ticket.markPrice } : {}),
    order_id: entry.id,
    amount_source: "quote",
  };
}

/** perp_trade_closed for a position the user closed from the desk. */
export function perpClosedProps(
  position: HlPositionView,
  market: string,
  closeOrder: HlOrderRow
): AnalyticsEvents["perp_trade_closed"] {
  const price = Number(position.markPrice ?? position.entryPrice);
  const notional = Math.round(Math.abs(Number(position.size)) * price * 1e6) / 1e6;
  return {
    pair: market,
    direction: position.side === "long" ? "long" : "short",
    position_id: position.id,
    close_type: "full",
    close_reason: "manual",
    // The mark the close was taken at. The venue reports the true fill; this is
    // what the desk saw, which is why the whole event is amount_source "quote".
    ...(Number.isFinite(price) ? { exit_price: price } : {}),
    pnl_usd: Number(position.unrealizedPnlUsdc ?? 0),
    notional_usd: notional,
    order_id: closeOrder.id,
    venue: "hyperliquid",
    amount_source: "quote",
  };
}
