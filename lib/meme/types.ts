// The trade service's token shape, in a file with no client directive so the
// server can import the type without pulling the browser client along.

export type TokenRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export interface TokenWarning {
  code: string;
  message: string;
}

export interface MemeToken {
  chainId: number;
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  priceUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPercent: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  pairAddress: string | null;
  dexName: string | null;
  riskLevel: TokenRiskLevel;
  // The service's lifecycle state: ACTIVE, DISCOVERED (unrated), BLOCKED.
  // Absent on the trending and search routes.
  status?: string;
  buyEnabled: boolean;
  sellEnabled: boolean;
  warnings: TokenWarning[];
}
