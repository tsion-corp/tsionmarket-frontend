// Filter tabs for the Markets token explorer and the row shape it renders.
// "Popular" is the global top-by-market-cap list; each chain maps to a CoinGecko
// ecosystem category (which includes that chain's memecoins).

export interface MarketFilter {
  key: string;
  label: string;
  category: string | null; // CoinGecko category slug; null = top by market cap
}

export const MARKET_FILTERS: readonly MarketFilter[] = [
  { key: "popular", label: "Popular", category: null },
  { key: "solana", label: "Solana", category: "solana-ecosystem" },
  { key: "ethereum", label: "Ethereum", category: "ethereum-ecosystem" },
  { key: "base", label: "Base", category: "base-ecosystem" },
  { key: "arbitrum", label: "Arbitrum", category: "arbitrum-ecosystem" },
  { key: "polygon", label: "Polygon", category: "polygon-ecosystem" },
  { key: "bnb", label: "BNB Chain", category: "binance-smart-chain" },
  { key: "avalanche", label: "Avalanche", category: "avalanche-ecosystem" },
];

export function marketFilter(key: string): MarketFilter | undefined {
  return MARKET_FILTERS.find((f) => f.key === key);
}

export interface MarketToken {
  id: string;
  symbol: string;
  name: string;
  logo: string | null;
  priceUsd: number;
  change24h: number;
  marketCap: number;
}
