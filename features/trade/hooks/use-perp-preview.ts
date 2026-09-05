"use client";

import { useMemo } from "react";
import {
  useHyperliquidAssets,
  useHyperliquidPrices,
} from "@/features/trade/hooks/use-hyperliquid-markets";

// The majors, in the order the dashboard brief shows them. Anything the venue
// lists beyond these fills the remaining rows in its own order.
const MAJORS = ["BTC", "ETH", "SOL"];

export interface PerpPreviewMarket {
  symbol: string;
  base: string;
  priceUsd: number;
  maxLeverage: number;
}

// The perps brief on the dashboard: a few markets with their mark and how far
// they can be levered.
//
// Rewritten onto the Hyperliquid data layer. It read the pre-rebuild perp
// hooks, which this branch replaced, so it was importing files that no longer
// exist; the brief itself is worth keeping, only its source had moved.
export function usePerpPreview(rows: number) {
  const { assets, loading: assetsLoading } = useHyperliquidAssets();
  const { prices, loading: pricesLoading } = useHyperliquidPrices();

  const markets = useMemo<PerpPreviewMarket[]>(() => {
    const rank = (symbol: string) => {
      const i = MAJORS.indexOf(symbol);
      return i === -1 ? MAJORS.length : i;
    };
    return [...assets]
      .sort((a, b) => rank(a.symbol) - rank(b.symbol))
      .slice(0, rows)
      .map((asset) => ({
        symbol: asset.symbol,
        base: asset.symbol,
        // A mid that has not arrived yet reads as zero, which the row renders
        // as an em dash rather than as a price of nothing.
        priceUsd: Number(prices[asset.symbol] ?? 0),
        maxLeverage: asset.maxLeverage,
      }));
  }, [assets, prices, rows]);

  return { markets, loading: assetsLoading || pricesLoading };
}
