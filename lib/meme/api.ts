"use client";

import { apiFetch } from "@/lib/api";

// Client for the Base token-trading service (memecoins), per its integration
// contract: public token discovery, Privy-authenticated wallet linking and
// swaps. Amounts are decimal strings end to end; the backend verifies every
// trade on-chain and only its CONFIRMED status means success.

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
  buyEnabled: boolean;
  sellEnabled: boolean;
  warnings: TokenWarning[];
}

export interface SwapPreview {
  side: "BUY" | "SELL";
  chainId: number;
  walletAddress: string;
  sellToken: MemeToken;
  buyToken: MemeToken;
  sellAmountAtomic: string;
  sellAmountFormatted: string;
  expectedBuyAmountAtomic: string;
  expectedBuyAmountFormatted: string;
  minimumBuyAmountAtomic: string;
  minimumBuyAmountFormatted: string;
  priceImpactBps: number | null;
  slippageBps: number;
  platformFeeAmountAtomic: string;
  platformFeeAmountFormatted: string;
  liquidityAvailable: boolean;
  approvalRequired: boolean;
  riskLevel: TokenRiskLevel;
  warnings: TokenWarning[];
  expiresAt: string;
}

export interface PreparedCall {
  type: "APPROVAL" | "SWAP";
  to: string;
  data: string;
  value: string;
}

export interface PreparedSwap {
  swapId: string;
  quoteId: string;
  chainId: number;
  side: "BUY" | "SELL";
  walletAddress: string;
  sellToken: MemeToken;
  buyToken: MemeToken;
  sellAmountAtomic: string;
  expectedBuyAmountAtomic: string;
  minimumBuyAmountAtomic: string;
  slippageBps: number;
  priceImpactBps: number | null;
  executionMode: "SINGLE_CALL" | "BATCHED_CALLS";
  calls: PreparedCall[];
  warnings: TokenWarning[];
  expiresAt: string;
}

export type SwapStatus =
  | "QUOTED"
  | "AWAITING_SUBMISSION"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REVERTED"
  | "EXPIRED"
  | "CANCELLED";

export interface SwapDetail {
  id: string;
  walletAddress: string;
  chainId: number;
  side: "BUY" | "SELL";
  status: SwapStatus;
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellTokenDecimals: number;
  buyTokenDecimals: number;
  sellAmountAtomic: string;
  quotedBuyAmountAtomic: string;
  actualSellAmountAtomic: string | null;
  actualBuyAmountAtomic: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface SwapRequest {
  side: "BUY" | "SELL";
  tokenAddress: string;
  amount: string;
  walletAddress: string;
  slippageBps?: number;
}

// The service error, keeping the machine code the UI branches on.
export class TradeApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {}
): Promise<T> {
  const res = await apiFetch(`/api/trade${path}`, init, { requireAuth: opts.auth });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new TradeApiError(
      body?.error?.code ?? "SERVICE_UNAVAILABLE",
      body?.error?.message ?? "Trading is unavailable right now.",
      res.status
    );
  }
  return body.data as T;
}

function post<T>(path: string, payload: unknown, idempotencyKey?: string): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(payload),
    },
    { auth: true }
  );
}

interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

export function fetchTrendingTokens(): Promise<Paged<MemeToken>> {
  return request("/tokens/trending");
}

export function fetchTokenCatalog(page = 1, limit = 20): Promise<Paged<MemeToken>> {
  return request(`/tokens?page=${page}&limit=${limit}`);
}

export function searchTokens(q: string): Promise<MemeToken[]> {
  return request(`/tokens/search?q=${encodeURIComponent(q.trim())}`);
}

export function fetchToken(address: string): Promise<MemeToken> {
  return request(`/tokens/${address}`);
}

export function fetchTradability(
  address: string
): Promise<{ buyEnabled: boolean; sellEnabled: boolean }> {
  return request(`/tokens/${address}/tradability`);
}

export function createWalletChallenge(
  walletAddress: string
): Promise<{ challengeId: string; message: string; expiresAt: string }> {
  return post("/wallets/challenges", { walletAddress });
}

export function verifyWallet(challengeId: string, signature: string): Promise<unknown> {
  return post("/wallets/verify", { challengeId, signature });
}

export function previewSwap(input: SwapRequest): Promise<SwapPreview> {
  return post("/swaps/preview", input);
}

export function quoteSwap(input: SwapRequest, idempotencyKey: string): Promise<PreparedSwap> {
  return post("/swaps/quote", input, idempotencyKey);
}

export function registerSubmission(
  swapId: string,
  callIndex: number,
  walletAddress: string,
  transactionHash: string,
  idempotencyKey: string
): Promise<{ swapId: string; status: string; callIndex: number }> {
  return post(
    `/swaps/${swapId}/submissions`,
    { walletAddress, callIndex, transactionHash },
    idempotencyKey
  );
}

export function fetchSwapStatus(
  swapId: string
): Promise<{ swapId: string; status: SwapStatus; updatedAt: string }> {
  return request(`/swaps/${swapId}/status`, {}, { auth: true });
}

export function fetchSwapHistory(page = 1, limit = 20): Promise<Paged<SwapDetail>> {
  return request(`/swaps?page=${page}&limit=${limit}`, {}, { auth: true });
}

// A positive plain-decimal amount the contract accepts ("12" or "12.5"), with
// no more fractional digits than the sold token supports.
export function isValidTradeAmount(amount: string, maxDecimals: number): boolean {
  if (!/^\d+(\.\d+)?$/.test(amount)) return false;
  const frac = amount.split(".")[1];
  if (frac && frac.length > maxDecimals) return false;
  return Number(amount) > 0;
}

// Compact USD for market stats ("$1.2M"); exact strings stay exact elsewhere.
export function compactUsd(value: string | null): string {
  const n = value === null ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}
