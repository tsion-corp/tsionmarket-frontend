import { buyableLogos, buyableSymbols, type BuyRoute } from "@/lib/buy";
import { isSpotStable } from "@/lib/spot-chart";
import { swapRouteSymbols } from "@/lib/spot-swap";
import type { MarketToken } from "@/lib/market-catalog";

// The spot universe as one pure composition, shared by the browser's market
// hook and the dashboard feed on the server: every token Dextopus can deliver,
// minus stablecoins, enriched from the CoinGecko feed and the by-symbol price
// feed where available.

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

// The Dextopus-buyable set, plus the small set of symbols that settle through
// a same-chain swap instead (see lib/spot-swap.ts): currently just DOGE, which
// Dextopus does not offer on any chain.
export function spotSymbolsFor(destinations: BuyRoute[]): string[] {
  const dextopus = buyableSymbols(destinations);
  return [...new Set([...dextopus, ...swapRouteSymbols()])].filter((s) => !isSpotStable(s));
}

export function composeSpotMarkets(
  destinations: BuyRoute[],
  feed: MarketToken[],
  prices: Record<string, number>
): SpotMarket[] {
  const symbols = spotSymbolsFor(destinations);
  const logos = buyableLogos(destinations);
  const feedBySym = new Map<string, MarketToken>();
  for (const t of feed) feedBySym.set(t.symbol.toUpperCase(), t);

  const rows = symbols.map((sym) => {
    const f = feedBySym.get(sym.toUpperCase());
    return {
      symbol: sym,
      name: f?.name ?? sym,
      priceUsd: prices[sym] ?? f?.priceUsd ?? 0,
      change24h: f?.change24h ?? 0,
      logo: f?.logo ?? logos.get(sym) ?? null,
      coingeckoId: f?.id ?? null,
      marketCap: f?.marketCap ?? 0,
    };
  });
  return rows.sort((a, b) => b.marketCap - a.marketCap || a.symbol.localeCompare(b.symbol));
}
