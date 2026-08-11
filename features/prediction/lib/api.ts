"use client";

import { apiFetch } from "@/lib/api";
import {
  PredictionApiError,
  normalizeActivityPage,
  normalizeChart,
  normalizeComments,
  normalizeEventChart,
  normalizeGroup,
  normalizeGroups,
  normalizeHolders,
  normalizeLpPositions,
  normalizeMarket,
  normalizeMarkets,
  normalizePositions,
  normalizePrices,
  normalizeQuote,
  normalizeTrades,
} from "@/features/prediction/lib/normalize";
import type {
  ActivityPage,
  ChartInterval,
  ChartPoint,
  Comment,
  LpPosition,
  Market,
  MarketGroup,
  MarketStatus,
  Position,
  PricePoint,
  Quote,
  Side,
  Trade,
} from "@/features/prediction/lib/types";

// Typed client for the prediction-market read + metadata service, through the
// /api/prediction proxy. Reads are public; writes only attach off-chain
// metadata. Every function normalizes the raw envelope into domain types before
// returning, so nothing downstream ever touches a raw payload. The money path
// (create/trade/redeem) is on-chain and lives in the action hooks, not here.

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const res = await apiFetch(`/api/prediction${path}`, init, { requireAuth: auth });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new PredictionApiError(
      body?.error?.code ?? "SERVICE_UNAVAILABLE",
      body?.error?.message ?? "Prediction markets are unavailable right now.",
      res.status,
      body?.error?.details
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
    false
  );
}

// The gateway filters by `status` only (per the OpenAPI spec). Category is not a
// server parameter, so callers filter by category client-side.
export async function listMarkets(status?: MarketStatus): Promise<Market[]> {
  const query = status ? `?status=${status}` : "";
  const raw = await request<unknown>(`/markets${query}`);
  return normalizeMarkets(raw);
}

// Markets this wallet created (matched on the on-chain creator), so a creator can
// find their own markets to resolve them.
export async function getMyMarkets(wallet: string): Promise<Market[]> {
  return normalizeMarkets(await request<unknown>(`/markets/mine?wallet=${wallet}`));
}

export async function getMarket(id: string): Promise<Market> {
  return normalizeMarket(await request<unknown>(`/markets/${id}`));
}

export async function getMarketChart(id: string, interval: ChartInterval): Promise<ChartPoint[]> {
  return normalizeChart(await request<unknown>(`/markets/${id}/chart?interval=${interval}`));
}

export async function getMarketPrices(id: string): Promise<PricePoint[]> {
  return normalizePrices(await request<unknown>(`/markets/${id}/prices`));
}

export async function getMarketTrades(id: string): Promise<Trade[]> {
  return normalizeTrades(await request<unknown>(`/markets/${id}/trades`));
}

export async function getCategories(): Promise<string[]> {
  const raw = await request<unknown>("/categories");
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is string => typeof c === "string");
}

export async function getPositions(wallet: string): Promise<Position[]> {
  const raw = await request<unknown>(`/positions?wallet=${wallet}`);
  return normalizePositions(raw);
}

export async function getPositionsForMarket(id: string, wallet: string): Promise<Position[]> {
  const raw = await request<unknown>(`/positions/${id}?wallet=${wallet}`);
  return normalizePositions(raw, BigInt(id));
}

export async function getLpPositions(wallet: string): Promise<LpPosition[]> {
  const raw = await request<unknown>(`/lp?wallet=${wallet}`);
  return normalizeLpPositions(raw);
}

// ── Top holders / activity / quote (per-market detail surfaces) ──────────────

export async function getHolders(
  id: string,
  side: Side,
  limit = 20
): Promise<import("@/features/prediction/lib/types").Holder[]> {
  return normalizeHolders(
    await request<unknown>(`/markets/${id}/holders?side=${side}&limit=${limit}`)
  );
}

export async function getActivity(id: string, cursor?: string, limit = 30): Promise<ActivityPage> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set("cursor", cursor);
  return normalizeActivityPage(await request<unknown>(`/markets/${id}/activity?${q.toString()}`));
}

// A size-aware CPMM quote. amount is USDC (buy) or shares (sell) in 6-dec base
// units, sent as a base-unit integer string.
export async function getQuote(
  id: string,
  side: Side,
  kind: "buy" | "sell",
  amount: bigint
): Promise<Quote> {
  const q = new URLSearchParams({ side, kind, amount: amount.toString() });
  return normalizeQuote(await request<unknown>(`/markets/${id}/quote?${q.toString()}`));
}

// ── Multi-outcome EVENTS (groups) ────────────────────────────────────────────

export async function listGroups(filter?: {
  category?: string;
  status?: string;
}): Promise<MarketGroup[]> {
  const q = new URLSearchParams();
  if (filter?.category) q.set("category", filter.category);
  if (filter?.status) q.set("status", filter.status);
  const qs = q.toString();
  return normalizeGroups(await request<unknown>(`/groups${qs ? `?${qs}` : ""}`));
}

export async function getGroup(idOrSlug: string): Promise<MarketGroup> {
  return normalizeGroup(await request<unknown>(`/groups/${idOrSlug}`));
}

export async function getGroupChart(
  idOrSlug: string,
  interval: ChartInterval
): Promise<import("@/features/prediction/lib/types").EventChartSeries[]> {
  return normalizeEventChart(
    await request<unknown>(`/groups/${idOrSlug}/chart?interval=${interval}`)
  );
}

export interface CreateGroupInput {
  slug: string;
  title: string;
  category?: string;
  description?: string;
  rules?: string;
  resolutionSource?: string;
  imageUrl?: string;
  closeTime?: number;
}

export function createGroup(
  input: CreateGroupInput,
  idempotencyKey: string
): Promise<{ id: string }> {
  return post("/groups", input, idempotencyKey);
}

export function addGroupMember(
  groupId: string,
  member: { marketId: string; label: string; imageUrl?: string; sortOrder?: number },
  idempotencyKey: string
): Promise<unknown> {
  return post(`/groups/${groupId}/members`, member, idempotencyKey);
}

export function uploadGroupImage(
  groupId: string,
  dataUrl: string,
  idempotencyKey: string
): Promise<{ groupId: string; imageUrl: string }> {
  return post(`/groups/${groupId}/image`, { image: dataUrl }, idempotencyKey);
}

// ── Comments (signature-verified writes) ─────────────────────────────────────

export async function listComments(
  scope: { groupId?: string; marketId?: string },
  limit = 50
): Promise<Comment[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (scope.groupId) q.set("groupId", scope.groupId);
  if (scope.marketId) q.set("marketId", scope.marketId);
  return normalizeComments(await request<unknown>(`/comments?${q.toString()}`));
}

export interface SignedComment {
  scope: "group" | "market";
  scopeId: string;
  body: string;
  wallet: string;
  signature: string;
  timestamp: number;
  parentId?: string;
}

export function postComment(input: SignedComment): Promise<{ id: string }> {
  return post("/comments", input);
}

export function likeComment(
  id: string,
  signed: { wallet: string; signature: string; timestamp: number }
): Promise<{ commentId: string; likeCount: number }> {
  return post(`/comments/${id}/like`, signed);
}

export interface MarketMetadata {
  question?: string;
  category?: string;
  imageUrl?: string;
  description?: string;
  rules?: string;
  resolutionSource?: string;
}

export function attachMetadata(
  id: string,
  metadata: MarketMetadata,
  idempotencyKey: string
): Promise<{ marketId: string; question?: string; category?: string }> {
  return post(`/markets/${id}/metadata`, metadata, idempotencyKey);
}

// Uploads a base64 data-URL image; the service hosts it on Cloudinary and
// returns the hosted URL. A 503 (image hosting unconfigured) surfaces as a
// typed error the create flow treats as non-fatal.
export function uploadImage(
  id: string,
  dataUrl: string,
  idempotencyKey: string
): Promise<{ marketId: string; imageUrl: string }> {
  return post(`/markets/${id}/image`, { image: dataUrl }, idempotencyKey);
}

// UUID v4 for idempotency keys. crypto.randomUUID only exists in secure
// contexts (https/localhost), so LAN-IP dev falls back to getRandomValues.
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
