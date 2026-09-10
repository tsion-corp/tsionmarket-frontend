"use client";

import { createServiceClient, type QueryParams } from "@/lib/api/service";
import type { RwaApiAsset, RwaChain } from "@/lib/rwa/catalog";

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

export const rwaClient = createServiceClient(
  "/api/rwa",
  "Real-world assets are unavailable right now."
);

export async function fetchRwaAssets(params: Record<string, string> = {}): Promise<RwaApiAsset[]> {
  const query: QueryParams = { ...params };
  return rwaClient.get<RwaApiAsset[]>("/assets", query);
}

export async function fetchRwaCategories(): Promise<RwaCategory[]> {
  return rwaClient.get<RwaCategory[]>("/categories");
}

export async function fetchYieldHistory(id: string, limit = 90): Promise<YieldHistoryPoint[]> {
  return rwaClient.get<YieldHistoryPoint[]>(`/assets/${encodeURIComponent(id)}/yield-history`, {
    limit,
  });
}

export async function fetchRwaQuote(req: RwaQuoteRequest): Promise<RwaQuoteResult> {
  return rwaClient.post<RwaQuoteResult>("/quote", req);
}

export async function buildRwaAction(
  req: RwaQuoteRequest & { taker: string; provider?: string; simulate?: boolean }
): Promise<RwaAction> {
  return rwaClient.post<RwaAction>("/build", req);
}
