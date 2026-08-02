"use client";

import { useMemo } from "react";
import { useBuyDestinations } from "@/hooks/use-buy-catalog";
import { useMarketTokens } from "@/hooks/use-market-tokens";
import { usePrices } from "@/hooks/use-prices";
import { buyableLogos, buyableSymbols } from "@/lib/buy";
import { isSpotStable } from "@/lib/spot-chart";
import type { MarketToken } from "@/lib/market-catalog";

export interface SpotMarket {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  logo: string | null;
  // Real CoinGecko id when the asset is in the market feed, else null (no id
  // means we chart via TradingView or not at all).
  coingeckoId: string | null;
  marketCap: number;
}

// The one spot universe, shared by the simple table and the pro terminal: every
// token Dextopus can deliver, minus stablecoins, enriched from the CoinGecko
// feed and the by-symbol price feed where available.
export function useSpotMarkets() {
  const destinations = useBuyDestinations();
  const { data: feed = [] } = useMarketTokens("popular");

  const buyableSyms = useMemo(() => {
    if (!destinations.data) return [];
    return [...buyableSymbols(destinations.data)].filter((s) => !isSpotStable(s));
  }, [destinations.data]);

  const prices = usePrices(buyableSyms);

  const dextopusLogos = useMemo(
    () => (destinations.data ? buyableLogos(destinations.data) : new Map<string, string>()),
    [destinations.data]
  );

  const feedBySym = useMemo(() => {
    const m = new Map<string, MarketToken>();
    for (const t of feed) m.set(t.symbol.toUpperCase(), t);
    return m;
  }, [feed]);

  const markets: SpotMarket[] = useMemo(() => {
    const rows = buyableSyms.map((sym) => {
      const f = feedBySym.get(sym.toUpperCase());
      return {
        symbol: sym,
        name: f?.name ?? sym,
        priceUsd: prices[sym] ?? f?.priceUsd ?? 0,
        change24h: f?.change24h ?? 0,
        logo: f?.logo ?? dextopusLogos.get(sym) ?? null,
        coingeckoId: f?.id ?? null,
        marketCap: f?.marketCap ?? 0,
      };
    });
    return rows.sort((a, b) => b.marketCap - a.marketCap || a.symbol.localeCompare(b.symbol));
  }, [buyableSyms, feedBySym, prices, dextopusLogos]);

  return {
    markets,
    destinations,
    loading: destinations.isLoading,
    error: destinations.isError,
  };
}
