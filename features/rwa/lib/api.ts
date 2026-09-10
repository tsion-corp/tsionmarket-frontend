"use client";

export { USDC_BY_CHAIN } from "@/lib/trade/usdc";

// The catalog's domain type and listing rules live in lib/rwa/catalog, below
// the feature line, so the dashboard feed can apply the same rules on the
// server. Re-exported here so the feature's own imports read as before.
export { assetPriceUsd, type AccessMode, type RwaApiAsset, type RwaChain } from "@/lib/rwa/catalog";
import { rwaLogoPath, type RwaApiAsset, type RwaChain } from "@/lib/rwa/catalog";

export interface RwaCategory {
  category: string;
  count: number;
}

export interface YieldHistoryPoint {
  timestamp: string;
  tvlUsd: number | null;
  apy: number | null;
}

export interface RwaQuoteRequest {
  chain: RwaChain;
  inputToken: string;
  outputToken: string;
  amountIn: string;
  slippageBps?: number;
}

export interface RwaQuote {
  provider: string;
  input: { chain: string; address: string; amount: string };
  output: { chain: string; address: string; amount: string; amountMin?: string };
  priceImpactBps: number | null;
  route?: { venue: string; portionBps: number }[];
}

export interface RwaQuoteResult {
  best: RwaQuote | null;
  all: RwaQuote[];
  failed: unknown[];
}

export interface RwaStep {
  id: string;
  kind: "sign-transaction" | "sign-typed-data" | "post-to-endpoint";
  chain: RwaChain;
  description: string;
  tx?: { format: string; base64?: string; to?: string; data?: string; value?: string };
  waitForConfirmation?: boolean;
}

export interface RwaAction {
  actionId: string;
  chain: RwaChain;
  expiresAt: string;
  steps: RwaStep[];
  quote?: RwaQuote;
  warnings?: string[];
}

export interface RwaApiError {
  code: string;
  message: string;
  details?: unknown;
}

export {
  fetchRwaAssets,
  fetchRwaCategories,
  fetchYieldHistory,
  fetchRwaQuote,
  buildRwaAction,
} from "@/lib/api/services/rwa";

// The pairing currency for buy/sell. Note BSC USDC has 18 decimals, not 6.
export function rwaLogoUrl(a: RwaApiAsset): string {
  return rwaLogoPath(a.chain, a.address);
}

export function assetTvlUsd(a: RwaApiAsset): string | undefined {
  return a.tvlUsd ?? a.issuerData?.tvlUsdTotal ?? undefined;
}
