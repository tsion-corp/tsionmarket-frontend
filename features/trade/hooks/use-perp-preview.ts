"use client";

import { useMemo } from "react";
import { usePerpPairs, usePerpPrices } from "@/features/trade/hooks/use-perp-markets";
import { usePrices } from "@/hooks/use-prices";
import { PERP_MAJOR_SYMBOLS, pairSymbol } from "@/lib/perp/logic";
import type { PerpPair } from "@/lib/perp/types";

export interface PerpPreviewMarket {
  /** Pair label, e.g. "BTC/USD". */
  symbol: string;
  /** Base asset, for the icon and the price fallback lookup. */
  base: string;
  priceUsd: number;
  maxLeverage: number;
}

// The majors for the dashboard's perps brief: pair config for leverage, the
// REST mark for price, the app's CoinGecko feed where the gateway has no mark.
//
// Deliberately no price socket. The desk opens one because a mark that lags a
// second matters to someone sizing a position; a four-row teaser is a doorway,
// and a WebSocket per dashboard visit is a cost with nothing behind it.
export function usePerpPreview(count: number): {
  markets: PerpPreviewMarket[];
  loading: boolean;
} {
  const { pairs, unavailable, loading: pairsLoading } = usePerpPairs();
  const live = !unavailable && pairs.length > 0;
  // Pairs carry leverage and prices carry the mark, so a row needs both. Waiting
  // on only the first paints the majors with an em dash where the price goes.
  // A disabled query never reports loading, so an undeployed gateway falls
  // straight through to the CoinGecko marks below rather than hanging here.
  const { prices, loading: pricesLoading } = usePerpPrices(live);
  const wanted = useMemo(() => PERP_MAJOR_SYMBOLS.slice(0, count), [count]);
  const fallback = usePrices(useMemo(() => wanted.map((s) => s.split("/")[0]), [wanted]));

  const pairBySymbol = useMemo(() => {
    const m = new Map<string, PerpPair>();
    for (const p of pairs) m.set(pairSymbol(p), p);
    return m;
  }, [pairs]);

  const markets = useMemo(
    () =>
      wanted.map((symbol) => {
        const base = symbol.split("/")[0];
        const mark = prices.get(symbol)?.price;
        return {
          symbol,
          base,
          priceUsd: mark != null ? Number(mark) : (fallback[base] ?? 0),
          // The gateway is the authority on leverage; the fallback figure is the
          // platform maximum, which every major carries.
          maxLeverage: pairBySymbol.get(symbol)?.maxLeverage ?? 50,
        };
      }),
    [wanted, prices, fallback, pairBySymbol]
  );

  return { markets, loading: pairsLoading || pricesLoading };
}
