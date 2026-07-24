export const COINGECKO_IDS: Record<string, string> = {
  SOL: "solana",
  BTC: "bitcoin",
  ETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
  BNB: "binancecoin",
  MATIC: "matic-network",
  POL: "matic-network",
  ARB: "arbitrum",
  OP: "optimism",
};

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
