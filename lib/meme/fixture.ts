import type { MemeToken, TokenRiskLevel } from "@/lib/meme/api";

// A complete token for tests. Complete on purpose: a partial cast hides the
// day a component starts reading a field the fixture never had.
export function memeToken(overrides: Partial<MemeToken> = {}): MemeToken {
  const symbol = overrides.symbol ?? "AAA";
  return {
    chainId: 8453,
    address: `0x${symbol.toLowerCase()}`,
    name: `${symbol} coin`,
    symbol,
    decimals: 18,
    logoUrl: null,
    priceUsd: "1.23",
    liquidityUsd: "10000",
    volume24hUsd: "5000",
    priceChange24hPercent: "4.2",
    marketCapUsd: "1000000",
    fdvUsd: "2000000",
    pairAddress: null,
    dexName: "Uniswap",
    riskLevel: "LOW" as TokenRiskLevel,
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
    ...overrides,
  };
}
