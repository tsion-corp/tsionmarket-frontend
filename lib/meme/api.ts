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

// Warnings worth showing a buyer. "The token contract is upgradeable" is
// dropped by design: nearly every serious token (USDC included) sits behind an
// upgradeable proxy, so the flag scares users off without telling them
// anything. Matched on code and message so it holds whichever field the
// service keys it on.
export function visibleWarnings(warnings: TokenWarning[]): TokenWarning[] {
  return warnings.filter((w) => !/upgrad/i.test(w.code) && !/upgradeable/i.test(w.message));
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
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey, "x-idem-key": idempotencyKey }
        : undefined,
      body: JSON.stringify(payload),
    },
    { auth: true }
  );
}

interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

// Base mainnet USDC. The trade service refuses it as a meme-token selection —
// it is the quote currency on both sides of every swap — so a card for it can
// only dead-end when tapped. The catalog lists it because the catalog is every
// indexed token, not every tradable meme coin.
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// Enough Base rows to fill several pages of eight after USDC is dropped.
const TRENDING_FALLBACK_LIMIT = 40;

// The trending upstream currently hangs for ~10s before failing. Give up early
// so the fallback lands while the loading placeholders are still on screen.
const TRENDING_TIMEOUT_MS = 4_000;

function withoutQuoteCurrency(page: Paged<MemeToken>): Paged<MemeToken> {
  const items = page.items.filter((t) => t.address.toLowerCase() !== BASE_USDC);
  return { items, meta: { ...page.meta, total: items.length } };
}

// The discovery feed and the persisted catalog are separate upstreams on the
// trade service, so trending can be down while the catalog is healthy. When
// that happens, fall back rather than showing an empty guided view beside a
// working pro table. A catalog page is not ranked by trend, but real tradable
// coins beat an "unavailable" panel. If the catalog is down too, that error
// surfaces and the view shows its unavailable state.
export async function fetchTrendingTokens(): Promise<Paged<MemeToken>> {
  try {
    return withoutQuoteCurrency(
      await request<Paged<MemeToken>>("/tokens/trending", {
        signal: AbortSignal.timeout(TRENDING_TIMEOUT_MS),
      })
    );
  } catch {
    // chain=base matches the "Trending on Base" heading and keeps every address
    // in the EVM form the token detail routes expect.
    return withoutQuoteCurrency(
      await request<Paged<MemeToken>>(`/tokens?page=1&limit=${TRENDING_FALLBACK_LIMIT}&chain=base`)
    );
  }
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

// UUID v4 for Idempotency-Key headers. crypto.randomUUID only exists in
// secure contexts (https/localhost), so LAN-IP dev and phone testing fall
// back to building one from getRandomValues.
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
