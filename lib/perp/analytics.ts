// Turns a perp request into the shape the analytics catalog expects.
//
// Kept out of the hook that sends the events so the mapping can be tested on
// its own, and so the open path and the screens agree on how a market is named.
// A position is only ever half the story in a report: the open and the close
// have to name the same market, or per-market PnL cannot be worked out at all.

import type { PerpTradeOpened } from "@/lib/analytics/events";
import type { MarketType } from "@/lib/analytics/events";
import { isUnsetLevel, pairSymbol } from "@/lib/perp/logic";
import type { OpenTradeRequest, PerpCategory, PerpOrderType, PerpPair } from "@/lib/perp/types";

// The app's perp categories are plural and include "other"; the analytics
// catalog's are singular and have no such bucket. An unmapped category returns
// undefined so the property is omitted rather than reported as something it is
// not.
export const MARKET_TYPE: Partial<Record<PerpCategory, MarketType>> = {
  crypto: "crypto",
  forex: "forex",
  commodities: "commodity",
  equities: "equity",
};

// The catalog knows three order types; the app has a fourth zero-fee market
// variant, which is still a market order as far as reporting goes.
export function orderKind(type: PerpOrderType): "market" | "limit" | "stop" {
  if (type === "limit") return "limit";
  if (type === "stop_limit") return "stop";
  return "market";
}

/**
 * The market's display symbol for a pairIndex, e.g. "ETH/USD".
 *
 * An open reports the market the user picked, but a position only carries its
 * numeric pairIndex, so every later event has to resolve the index back to the
 * same name. Falls back to the index when the pairs list has not loaded, which
 * keeps the event honest instead of guessing a symbol.
 */
export function perpMarketName(pairs: PerpPair[], pairIndex: number): string {
  const pair = pairs.find((p) => p.pairIndex === pairIndex);
  return pair ? pairSymbol(pair) : `pair_${pairIndex}`;
}

/**
 * The `perp_trade_opened` properties for a request.
 *
 * `resting` says whether the order is a limit or stop waiting on its trigger.
 * That changes which price is being reported: a resting order has not opened at
 * any price yet, so the level it waits for is the limit price, not an entry.
 */
export function perpOpenedProps(
  req: Omit<OpenTradeRequest, "trader">,
  resting: boolean,
  category?: PerpCategory
): PerpTradeOpened {
  const price = req.openPrice ? Number(req.openPrice) : undefined;
  // "TP: none" and "SL: none" travel as "0", which would read as a real level
  // set at zero.
  const takeProfit =
    req.takeProfit && !isUnsetLevel(req.takeProfit) ? Number(req.takeProfit) : undefined;
  const stopLoss = req.stopLoss && !isUnsetLevel(req.stopLoss) ? Number(req.stopLoss) : undefined;

  return {
    market: req.pair,
    market_type: category ? MARKET_TYPE[category] : undefined,
    side: req.isLong ? "long" : "short",
    leverage: Number(req.leverage),
    collateral_usd: Number(req.collateralUsdc),
    position_size_usd: Number(req.collateralUsdc) * Number(req.leverage),
    order_type: orderKind(req.orderType),
    entry_price: resting ? undefined : price,
    limit_price: resting ? price : undefined,
    has_take_profit: takeProfit !== undefined,
    take_profit_price: takeProfit,
    has_stop_loss: stopLoss !== undefined,
    stop_loss_price: stopLoss,
  };
}
