// Normalized market-data shapes derived from Hyperliquid's raw WebSocket
// subscription events (@nktkas/hyperliquid/api/subscription) — mapped here,
// once, before any of it reaches a component, the same "external payloads
// never reach components raw" rule hyperliquid-types.ts already follows for
// the backend's REST shapes. See hyperliquid-ws-client.ts for the actual
// subscription plumbing these types feed.

import type {
  ActiveAssetCtxEvent,
  L2BookEvent,
  TradesEvent,
} from "@nktkas/hyperliquid/api/subscription";

export interface HlOrderBookLevel {
  price: string;
  size: string;
  /** Cumulative size from the best price out to and including this level — the depth-bar basis. */
  total: string;
}

export interface HlOrderBookSnapshot {
  coin: string;
  time: number;
  bids: HlOrderBookLevel[];
  asks: HlOrderBookLevel[];
  /** Best ask minus best bid; null when either side is briefly empty. */
  spread: number | null;
}

export function toOrderBookSnapshot(event: L2BookEvent): HlOrderBookSnapshot {
  const [bidLevels, askLevels] = event.levels;
  const bids = withCumulativeTotal(bidLevels);
  const asks = withCumulativeTotal(askLevels);
  const bestBid = bids[0] ? Number(bids[0].price) : null;
  const bestAsk = asks[0] ? Number(asks[0].price) : null;
  return {
    coin: event.coin,
    time: event.time,
    bids,
    asks,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
  };
}

function withCumulativeTotal(levels: { px: string; sz: string }[]): HlOrderBookLevel[] {
  let running = 0;
  return levels.map((level) => {
    running += Number(level.sz);
    return { price: level.px, size: level.sz, total: running.toString() };
  });
}

export interface HlTradeTick {
  coin: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  time: number;
  /** Unique per trade — a stable React list key. */
  id: number;
}

export function toTradeTicks(event: TradesEvent): HlTradeTick[] {
  return event.map((trade) => ({
    coin: trade.coin,
    side: trade.side === "B" ? "buy" : "sell",
    price: trade.px,
    size: trade.sz,
    time: trade.time,
    id: trade.tid,
  }));
}

export interface HlAssetContext {
  coin: string;
  markPrice: number;
  oraclePrice: number;
  prevDayPrice: number;
  dayVolumeUsd: number;
  openInterest: number;
  fundingRate: number;
}

export function toAssetContext(event: ActiveAssetCtxEvent): HlAssetContext {
  return {
    coin: event.coin,
    markPrice: Number(event.ctx.markPx),
    oraclePrice: Number(event.ctx.oraclePx),
    prevDayPrice: Number(event.ctx.prevDayPx),
    dayVolumeUsd: Number(event.ctx.dayNtlVlm),
    openInterest: Number(event.ctx.openInterest),
    fundingRate: Number(event.ctx.funding),
  };
}
