export const COINGECKO_IDS: Record<string, string> = {
  SOL: "solana",
  BTC: "bitcoin",
  ETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
  BNB: "binancecoin",
  MATIC: "polygon-ecosystem-token",
  POL: "polygon-ecosystem-token",
  ARB: "arbitrum",
  OP: "optimism",
};

// Dextopus chain label -> CoinGecko asset-platform id, for resolving a token's
// coin id (and therefore its chart) from its contract address when the market
// feed doesn't already carry it.
export const COINGECKO_PLATFORM: Record<string, string> = {
  base: "base",
  ethereum: "ethereum",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  polygon: "polygon-pos",
  solana: "solana",
};

export function coingeckoPlatform(chainName: string): string | null {
  return COINGECKO_PLATFORM[chainName.toLowerCase()] ?? null;
}

export type ChartRange = "1D" | "1W" | "1M" | "1Y" | "ALL";

export const RANGE_DAYS: Record<ChartRange, string> = {
  "1D": "1",
  "1W": "7",
  "1M": "30",
  "1Y": "365",
  ALL: "max",
};

export function coingeckoId(symbol: string): string | null {
  return COINGECKO_IDS[symbol.toUpperCase()] ?? null;
}
