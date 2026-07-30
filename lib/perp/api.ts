"use client";

import { apiFetch } from "@/lib/api";
import type {
  BuildResult,
  OpenPosition,
  OpenTradeRequest,
  PerpOrder,
  PerpPair,
  PerpPairMarket,
  PerpPrice,
  TradeQuote,
} from "@/lib/perp/types";

// Typed client for the perp gateway, reached through our /api/perp proxy. Every
// response uses the { success, data | error } envelope; unwrap() narrows it and
// throws a typed error so hooks can branch on .code. Raw payloads never reach
// components: everything is typed here at the seam.

export interface PerpApiError {
  code: string;
  message: string;
  details?: unknown;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (body && body.success === true) return body.data as T;
  const err: PerpApiError = body?.error ?? {
    code: "SERVICE_UNAVAILABLE",
    message: "Request failed",
  };
  const thrown = new Error(err.message) as Error & { code: string; details?: unknown };
  thrown.code = err.code;
  thrown.details = err.details;
  throw thrown;
}

export function perpErrorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

// The gateway is not deployed yet in some environments; these codes mean "not
// available", not "you did something wrong", so the UI shows its preview state.
export function isPerpUnavailable(e: unknown): boolean {
  const code = perpErrorCode(e);
  return code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
}

export async function fetchPerpPairs(category?: string): Promise<PerpPair[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const pairs = await unwrap<PerpPair[]>(await apiFetch(`/api/perp/pairs${query}`));
  // The gateway currently returns a couple of placeholder slots with empty
  // from/to (delisted pair indices). They render as "/" rows, so drop them.
  return pairs.filter((p) => p.from !== "" && p.to !== "");
}

export async function fetchPerpMarket(pair: string): Promise<PerpPairMarket> {
  return unwrap<PerpPairMarket>(
    await apiFetch(`/api/perp/market?pair=${encodeURIComponent(pair)}`)
  );
}

export async function fetchPerpPrices(): Promise<PerpPrice[]> {
  return unwrap<PerpPrice[]>(await apiFetch("/api/perp/prices"));
}

export async function fetchPerpPositions(trader: string): Promise<OpenPosition[]> {
  return unwrap<OpenPosition[]>(
    await apiFetch(`/api/perp/trades?trader=${encodeURIComponent(trader)}`)
  );
}

// Pending (unfilled) limit and stop orders; they rest here until the keeper
// fills them at their trigger price, or the user cancels.
export async function fetchPerpOrders(trader: string): Promise<PerpOrder[]> {
  return unwrap<PerpOrder[]>(
    await apiFetch(`/api/perp/orders?trader=${encodeURIComponent(trader)}`)
  );
}

export interface QuoteRequest {
  pair: string;
  isLong: boolean;
  collateralUsdc: string;
  leverage: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await apiFetch(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { requireAuth: true }
    )
  );
}

export async function fetchPerpQuote(req: QuoteRequest): Promise<TradeQuote> {
  return post<TradeQuote>("/api/perp/quote", req);
}

export async function buildApproveUsdc(amountUsdc: string): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/approve-usdc", { amountUsdc });
}

export async function buildOpenTrade(req: OpenTradeRequest): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/open-trade", req);
}

export async function buildCloseTrade(req: {
  pairIndex: number;
  tradeIndex: number;
  collateralUsdc: string;
}): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/close-trade", req);
}

export async function buildUpdateMargin(req: {
  pairIndex: number;
  tradeIndex: number;
  marginUsdc: string;
  direction: "deposit" | "withdraw";
}): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/update-margin", req);
}

export async function buildUpdateTpSl(req: {
  pairIndex: number;
  tradeIndex: number;
  takeProfit?: string;
  stopLoss?: string;
}): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/update-tp-sl", req);
}

export async function buildCancelOrder(req: {
  pairIndex: number;
  orderIndex: number;
}): Promise<BuildResult> {
  return post<BuildResult>("/api/perp/build/cancel-order", req);
}
