"use client";

import { formatAmount } from "@/lib/trade/math";
import { useHyperliquidTrades } from "@/features/trade/hooks/use-hyperliquid-trades";

interface HyperliquidTradeTapeProps {
  symbol: string;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Live scrolling tape of the most recent fills on Hyperliquid for one asset
// — side-colored, newest first (use-hyperliquid-trades.ts caps the window).
export function HyperliquidTradeTape({ symbol }: HyperliquidTradeTapeProps) {
  const { trades, connected } = useHyperliquidTrades(symbol || null);

  if (!symbol) {
    return <p className="p-4 text-[12.5px] font-normal text-white/45">No market selected.</p>;
  }
  if (!connected) {
    return <p className="p-4 text-[12.5px] font-normal text-white/45">Connecting…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pb-1.5 text-[11px] font-normal text-white/45">
        <span>Price</span>
        <span>Size</span>
        <span>Time</span>
      </div>
      <div className="ws-no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {trades.map((trade) => (
          <div key={trade.id} className="flex items-center justify-between px-3 py-1 text-[11.5px]">
            <span className={`tnum ${trade.side === "buy" ? "text-up" : "text-down"}`}>
              {formatAmount(Number(trade.price))}
            </span>
            <span className="tnum text-white/55">{formatAmount(Number(trade.size))}</span>
            <span className="tnum text-white/35">{formatTime(trade.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
