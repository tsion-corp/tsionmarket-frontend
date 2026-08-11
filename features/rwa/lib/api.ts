"use client";

import { apiFetch } from "@/lib/api";

export { USDC_BY_CHAIN } from "@/lib/trade/usdc";

export type RwaChain = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "polygon";
export type AccessMode = "dex" | "issuer" | "hybrid";

export interface RwaApiAsset {
  id: string;
  chain: RwaChain;
  address: string;
  symbol: string;
  name: string;
  issuer: string;
  category: string;
  // Null for most assets in practice, not merely absent.
  yieldApyBps?: number | null;
  priceUsd: string | null;
  freelyTradable: boolean;
  accessMode?: AccessMode;
  kycRequired?: boolean;
  minInvestmentUsd?: string | null;
  redemption?: string;
  issuerUrl?: string;
  deprecated?: boolean;
  tvlUsd?: string;
  meta?: { note?: string };
  issuerData?: { navPriceUsd?: string; apyBps?: number; tvlUsdTotal?: string };
}

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

// Unwraps the { success, data | error } envelope and throws a typed error.
async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (body && body.success === true) return body.data as T;
  const err: RwaApiError = body?.error ?? {
    code: "SERVICE_UNAVAILABLE",
    message: "Request failed",
  };
  const thrown = new Error(err.message) as Error & { code: string; details?: unknown };
  thrown.code = err.code;
  thrown.details = err.details;
  throw thrown;
}

export async function fetchRwaAssets(params: Record<string, string> = {}): Promise<RwaApiAsset[]> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/rwa/assets${query ? `?${query}` : ""}`);
  return unwrap<RwaApiAsset[]>(res);
}

export async function fetchRwaCategories(): Promise<RwaCategory[]> {
  return unwrap<RwaCategory[]>(await apiFetch("/api/rwa/categories"));
}

export async function fetchYieldHistory(id: string, limit = 90): Promise<YieldHistoryPoint[]> {
  return unwrap<YieldHistoryPoint[]>(
    await apiFetch(`/api/rwa/assets/${encodeURIComponent(id)}/yield-history?limit=${limit}`)
  );
}

export async function fetchRwaQuote(req: RwaQuoteRequest): Promise<RwaQuoteResult> {
  const res = await apiFetch("/api/rwa/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return unwrap<RwaQuoteResult>(res);
}

export async function buildRwaAction(
  req: RwaQuoteRequest & { taker: string; provider?: string; simulate?: boolean }
): Promise<RwaAction> {
  const res = await apiFetch("/api/rwa/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return unwrap<RwaAction>(res);
}

export function assetPriceUsd(a: RwaApiAsset): number | null {
  const p = a.priceUsd ?? a.issuerData?.navPriceUsd ?? null;
  const n = p != null ? Number(p) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The pairing currency for buy/sell. Note BSC USDC has 18 decimals, not 6.
// Real token logo by contract address, resolved server-side (CoinGecko first,
// then Trust Wallet). AssetIcon tries web3icons by symbol first, then this, so
// every asset resolves to its real logo.
export function rwaLogoUrl(a: RwaApiAsset): string {
  return `/api/token-logo/${a.chain}/${a.address}`;
}

export function assetTvlUsd(a: RwaApiAsset): string | undefined {
  return a.tvlUsd ?? a.issuerData?.tvlUsdTotal ?? undefined;
}
