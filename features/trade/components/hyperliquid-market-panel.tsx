"use client";

import { useState } from "react";
import { CHART_PANEL_HEIGHT } from "@/features/trade/components/hyperliquid-chart-panel";
import { HyperliquidOrderBook } from "@/features/trade/components/hyperliquid-order-book";
import { HyperliquidTradeTape } from "@/features/trade/components/hyperliquid-trade-tape";

interface HyperliquidMarketPanelProps {
  symbol: string;
  /** Real measured row height (see HyperliquidProPerps) — falls back to
   *  CHART_PANEL_HEIGHT until measured or on the stacked/mobile layout. */
  height?: number;
}

type Tab = "book" | "trades";

const TABS: [Tab, string][] = [
  ["book", "Order Book"],
  ["trades", "Trades"],
];

// Order Book / Trades, tabbed together in one card — matches Hyperliquid's
// own pro layout. Fed entirely by the direct browser-to-Hyperliquid
// WebSocket subscriptions in hyperliquid-ws-client.ts; this backend has no
// role in market data (see apps/perp/src/streaming/README.md).
export function HyperliquidMarketPanel({
  symbol,
  height = CHART_PANEL_HEIGHT,
}: HyperliquidMarketPanelProps) {
  const [tab, setTab] = useState<Tab>("book");

  return (
    <div className="ws-card flex flex-col p-2" style={{ height }}>
      <div className="flex gap-1 p-1.5">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex-1 cursor-pointer rounded-lg py-1.5 text-[12px] font-semibold transition-colors ${
              tab === value ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "book" ? (
          <HyperliquidOrderBook symbol={symbol} />
        ) : (
          <HyperliquidTradeTape symbol={symbol} />
        )}
      </div>
    </div>
  );
}
