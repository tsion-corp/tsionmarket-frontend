"use client";

import { useEffect, useState } from "react";
import { TradingViewChart } from "@/components/ui/tradingview-chart";
import { ExpandIcon, CollapseIcon } from "@/components/ui/icons";
import { HyperliquidFundingChart } from "@/features/trade/components/hyperliquid-funding-chart";
import { tradingViewSymbolForAsset } from "@/features/trade/lib/hyperliquid-tradingview";

interface HyperliquidChartPanelProps {
  /** Raw asset symbol, e.g. "BTC" or the HIP-3 wire form "xyz:AAPL" — empty until a market is selected. */
  assetSymbol: string;
  /** The asset's coarse class ("crypto", "equities", ...) — picks the TradingView venue mapping. */
  assetCategory?: string | null;
  /** Real measured height of the order ticket (see HyperliquidProPerps'
   *  ResizeObserver) — falls back to CHART_PANEL_HEIGHT until measured. */
  height?: number;
}

type PanelTab = "chart" | "funding";

// A real, fixed pixel height — not a percentage chained through grid
// stretch/flex-1. That chain looked right until real content (order-book
// rows, whose count varies with live depth) sat inside it: CSS Grid can't
// resolve a row's height from a percentage-height descendant without
// circularity, so the "cap" silently stopped applying and panels grew with
// however much data arrived. A fixed number can never do that — it does not
// participate in any ancestor's sizing computation at all. This is also the
// fallback before HyperliquidProPerps' ResizeObserver has measured the
// order ticket's real height for the first time.
export const CHART_PANEL_HEIGHT = 560;

// The chart card: Chart/Funding tabs, and its own fullscreen toggle (Escape
// exits, same as any native fullscreen surface — local UI state, not the
// browser Fullscreen API, since it can't reach into the TradingView iframe's
// own internal chrome either way). Timeframe, drawing tools, indicators,
// and the timezone picker are all TradingView's own native toolbar
// (hide_side_toolbar=0/hide_top_toolbar=0 on TradingViewChart) — no need to
// duplicate any of that here.
//
// Uses TradingView's own resolved-symbol data rather than Hyperliquid's own
// OHLC, at the user's explicit request — the trade-off is the chart's own
// OHLC can visibly diverge from this app's real order book/fills, which come
// from Hyperliquid, not from whichever exchange TradingView's free widget
// resolves this symbol to.
export function HyperliquidChartPanel({
  assetSymbol,
  assetCategory,
  height = CHART_PANEL_HEIGHT,
}: HyperliquidChartPanelProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("chart");

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-black p-4"
          : "ws-card flex flex-col overflow-hidden p-4 sm:p-5"
      }
      style={fullscreen ? undefined : { height }}
    >
      <div className="mb-3 flex flex-none flex-wrap items-center justify-between gap-2">
        <div className="flex gap-4 border-b border-white/10">
          {(["chart", "funding"] as PanelTab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`cursor-pointer border-b-2 pb-2 text-[13px] font-semibold capitalize transition-colors ${
                tab === value
                  ? "border-up text-white"
                  : "border-transparent text-white/45 hover:text-white/70"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFullscreen((value) => !value)}
            aria-label={fullscreen ? "Exit fullscreen" : "Expand chart"}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/4 p-1.5 text-white/55 transition-colors hover:border-white/25 hover:text-white"
          >
            {fullscreen ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "funding" ? (
          <HyperliquidFundingChart symbol={assetSymbol} height="100%" />
        ) : assetSymbol ? (
          <TradingViewChart
            symbol={tradingViewSymbolForAsset(assetSymbol, assetCategory)}
            height="100%"
          />
        ) : (
          <div
            style={{ height: "100%" }}
            className="grid place-items-center text-[13.5px] font-normal text-white/45"
          >
            No market selected
          </div>
        )}
      </div>
    </div>
  );
}
