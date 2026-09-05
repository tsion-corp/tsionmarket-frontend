"use client";

import { FlashPrice } from "@/features/trade/components/flash-price";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import { useHyperliquidOrderBook } from "@/features/trade/hooks/use-hyperliquid-order-book";
import type { HlOrderBookLevel } from "@/features/trade/lib/hyperliquid-ws-types";

interface HyperliquidOrderBookProps {
  symbol: string;
}

const VISIBLE_LEVELS = 12;

function maxTotal(levels: HlOrderBookLevel[]): number {
  return levels.reduce((max, level) => Math.max(max, Number(level.total)), 0);
}

function OrderBookRow({
  level,
  side,
  depthPct,
}: {
  level: HlOrderBookLevel;
  side: "bid" | "ask";
  depthPct: number;
}) {
  return (
    <div className="relative flex items-center justify-between px-3 py-1 text-[11.5px]">
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-up/10" : "bg-down/10"}`}
        style={{ width: `${depthPct}%` }}
      />
      <span className={`tnum relative ${side === "bid" ? "text-up" : "text-down"}`}>
        {formatAmount(Number(level.price))}
      </span>
      <span className="tnum relative text-white/55">{formatAmount(Number(level.size))}</span>
    </div>
  );
}

// Live L2 depth ladder for one asset — asks above the spread (furthest from
// mid at the top, matching Hyperliquid's own layout), bids below. The
// translucent bar behind each row is sized to that level's cumulative depth
// (use-hyperliquid-order-book.ts computes the running total once, before
// this ever renders).
export function HyperliquidOrderBook({ symbol }: HyperliquidOrderBookProps) {
  const { book, connected } = useHyperliquidOrderBook(symbol || null);

  if (!symbol) {
    return <p className="p-4 text-[12.5px] font-normal text-white/45">No market selected.</p>;
  }
  if (!connected || !book) {
    return <p className="p-4 text-[12.5px] font-normal text-white/45">Connecting…</p>;
  }

  const asks = [...book.asks.slice(0, VISIBLE_LEVELS)].reverse();
  const bids = book.bids.slice(0, VISIBLE_LEVELS);
  const askMax = maxTotal(asks);
  const bidMax = maxTotal(bids);
  const mid =
    book.bids[0] && book.asks[0]
      ? (Number(book.bids[0].price) + Number(book.asks[0].price)) / 2
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pb-1.5 text-[11px] font-normal text-white/45">
        <span>Price</span>
        <span>Size</span>
      </div>
      {/* Everything below the header scrolls as ONE unit, contained to
          whatever height the grid gave this card (matched to the chart) —
          asks/spread/bids never spill past the card's own edge. */}
      <div className="ws-no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div>
          {asks.map((level) => (
            <OrderBookRow
              key={level.price}
              level={level}
              side="ask"
              depthPct={askMax > 0 ? (Number(level.total) / askMax) * 100 : 0}
            />
          ))}
        </div>
        <div className="my-1 flex items-center justify-between border-y border-white/8 px-3 py-1.5">
          <FlashPrice value={mid} className="ws-display tnum text-[13px]">
            {mid > 0 ? formatUsd(mid) : "—"}
          </FlashPrice>
          <span className="tnum text-[11px] text-white/45">
            {book.spread != null ? `spread ${formatAmount(book.spread)}` : null}
          </span>
        </div>
        <div>
          {bids.map((level) => (
            <OrderBookRow
              key={level.price}
              level={level}
              side="bid"
              depthPct={bidMax > 0 ? (Number(level.total) / bidMax) * 100 : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
