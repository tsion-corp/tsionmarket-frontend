// Normalization seam: raw prediction-market API payloads (6-dec integer strings,
// unix-second numbers, string enums) mapped into the numeric domain model. No
// framework imports. Components never see a raw payload; they only ever get the
// types in ./types. Malformed input throws a typed error rather than coercing
// silently, so a bad field surfaces at the seam instead of corrupting money math
// downstream.

import {
  PRICE_SCALE,
  type ActivityItem,
  type ActivityKind,
  type ActivityPage,
  type ChartPoint,
  type Comment,
  type EventChartSeries,
  type GroupOutcome,
  type Holder,
  type LpPosition,
  type Market,
  type MarketGroup,
  type MarketStatus,
  type Outcome,
  type Position,
  type PricePoint,
  type Quote,
  type Side,
  type Trade,
} from "@/lib/prediction/types";

export class PredictionApiError extends Error {
  code: string;
  status: number;
  // Optional error.details from the envelope (e.g. { reason: "not_configured" }
  // on the image endpoint), so callers can degrade gracefully.
  details?: unknown;
  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = "PredictionApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Whether an image-upload failure is because Cloudinary isn't configured on the
// deployment (a 502 with details.reason === "not_configured"), which the create
// flow treats as "attach no image" rather than a hard error.
export function isImageNotConfigured(error: unknown): boolean {
  if (!(error instanceof PredictionApiError)) return false;
  const details = error.details;
  return (
    !!details &&
    typeof details === "object" &&
    (details as { reason?: unknown }).reason === "not_configured"
  );
}

const MALFORMED = "MALFORMED_RESPONSE";

// A non-negative integer string or JS integer to bigint. The API sends money,
// reserves, shares, and prices as already-scaled integer strings.
function toBig(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PredictionApiError(MALFORMED, `Field "${field}" is not a valid integer.`);
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  throw new PredictionApiError(MALFORMED, `Field "${field}" is not a valid amount.`);
}

// A finite non-negative unix-seconds timestamp.
function toUnixSeconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PredictionApiError(MALFORMED, `Field "${field}" is not a valid timestamp.`);
  }
  return Math.floor(value);
}

function toNullableStr(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

const STATUSES: readonly MarketStatus[] = ["Open", "Closed", "Resolved", "Invalid"];
const OUTCOMES: readonly Outcome[] = ["Unresolved", "Yes", "No"];

function toStatus(value: unknown): MarketStatus {
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) {
    return value as MarketStatus;
  }
  throw new PredictionApiError(MALFORMED, `Unknown market status "${String(value)}".`);
}

function toOutcome(value: unknown): Outcome {
  if (typeof value === "string" && (OUTCOMES as readonly string[]).includes(value)) {
    return value as Outcome;
  }
  throw new PredictionApiError(MALFORMED, `Unknown market outcome "${String(value)}".`);
}

function toSide(value: unknown): Side {
  if (value === "yes" || value === "no") return value;
  throw new PredictionApiError(MALFORMED, `Unknown side "${String(value)}".`);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object") {
    throw new PredictionApiError(MALFORMED, "Expected an object.");
  }
  return value as Record<string, unknown>;
}

export function normalizeMarket(raw: unknown): Market {
  const m = asRecord(raw);
  const priceYes = toBig(m.priceYes, "priceYes");
  return {
    marketId: toBig(m.marketId, "marketId"),
    // Creator can be empty on markets not yet fully indexed; don't reject those.
    creator: typeof m.creator === "string" ? m.creator : "",
    question: toNullableStr(m.question),
    category: toNullableStr(m.category),
    imageUrl: toNullableStr(m.imageUrl),
    description: toNullableStr(m.description),
    rules: toNullableStr(m.rules),
    resolutionSource: toNullableStr(m.resolutionSource),
    status: toStatus(m.status),
    outcome: toOutcome(m.outcome),
    closeTime: toUnixSeconds(m.closeTime, "closeTime"),
    feeBps: Number(toBig(m.feeBps, "feeBps")),
    priceYes,
    // Single source of truth: derive priceNo from priceYes even when the API
    // supplies it, so the two can never disagree.
    priceNo: PRICE_SCALE - priceYes,
    rYes: toBig(m.rYes, "rYes"),
    rNo: toBig(m.rNo, "rNo"),
    totalLp: toBig(m.totalLp, "totalLp"),
    collateral: toBig(m.collateral, "collateral"),
    volumeUsdc: toBig(m.volumeUsdc, "volumeUsdc"),
  };
}

// Normalizes a list, skipping any entry that fails rather than throwing the
// whole list away. A single malformed row from the indexer must never blank an
// entire view; the bad row is dropped and logged.
function mapValid<T>(raw: unknown, one: (item: unknown) => T, label: string): T[] {
  if (!Array.isArray(raw)) throw new PredictionApiError(MALFORMED, `Expected a ${label} list.`);
  const out: T[] = [];
  for (const item of raw) {
    try {
      out.push(one(item));
    } catch (error) {
      console.warn(`[prediction] skipping malformed ${label}`, error);
    }
  }
  return out;
}

export function normalizeMarkets(raw: unknown): Market[] {
  return mapValid(raw, normalizeMarket, "market");
}

export function normalizeTrade(raw: unknown): Trade {
  const t = asRecord(raw);
  return {
    txHash: typeof t.txHash === "string" ? t.txHash : "",
    trader: typeof t.trader === "string" ? t.trader : "",
    buy: Boolean(t.buy),
    side: toSide(t.side),
    usdcAmount: toBig(t.usdcAmount, "usdcAmount"),
    shareAmount: toBig(t.shareAmount, "shareAmount"),
    priceYes: toBig(t.priceYes, "priceYes"),
    block: Number(toBig(t.block, "block")),
  };
}

export function normalizeTrades(raw: unknown): Trade[] {
  return mapValid(raw, normalizeTrade, "trade");
}

export function normalizeChartPoint(raw: unknown): ChartPoint {
  const p = asRecord(raw);
  return {
    t: toUnixSeconds(p.t, "t"),
    yes: toBig(p.yes, "yes"),
    no: toBig(p.no, "no"),
  };
}

export function normalizeChart(raw: unknown): ChartPoint[] {
  return mapValid(raw, normalizeChartPoint, "chart point");
}

export function normalizePricePoint(raw: unknown): PricePoint {
  const p = asRecord(raw);
  return {
    block: Number(toBig(p.block, "block")),
    priceYes: toBig(p.priceYes, "priceYes"),
  };
}

export function normalizePrices(raw: unknown): PricePoint[] {
  return mapValid(raw, normalizePricePoint, "price point");
}

// Positions from the list endpoint carry marketId; the per-market endpoint omits
// it, so the caller supplies it.
export function normalizePosition(raw: unknown, marketId?: bigint): Position {
  const p = asRecord(raw);
  return {
    marketId: marketId ?? toBig(p.marketId, "marketId"),
    side: toSide(p.side),
    shares: toBig(p.shares, "shares"),
    costUsdc: toBig(p.costUsdc, "costUsdc"),
  };
}

export function normalizePositions(raw: unknown, marketId?: bigint): Position[] {
  return mapValid(raw, (item) => normalizePosition(item, marketId), "position");
}

export function normalizeLpPosition(raw: unknown): LpPosition {
  const l = asRecord(raw);
  return {
    marketId: toBig(l.marketId, "marketId"),
    lpShares: toBig(l.lpShares, "lpShares"),
  };
}

export function normalizeLpPositions(raw: unknown): LpPosition[] {
  return mapValid(raw, normalizeLpPosition, "LP position");
}

// ── Groups / holders / activity / comments / quote ───────────────────────────

// A possibly-negative integer (price impact bps) to a JS number.
function toInt(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  throw new PredictionApiError(MALFORMED, `Field "${field}" is not an integer.`);
}

// An ISO datetime or unix-ms number to unix ms.
function toUnixMs(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw new PredictionApiError(MALFORMED, `Field "${field}" is not a valid time.`);
}

const GROUP_STATUSES = ["Open", "Closed", "Resolved"] as const;
function toGroupStatus(value: unknown): MarketGroup["status"] {
  if (typeof value === "string" && (GROUP_STATUSES as readonly string[]).includes(value)) {
    return value as MarketGroup["status"];
  }
  return "Open";
}

export function normalizeGroupOutcome(raw: unknown): GroupOutcome {
  const o = asRecord(raw);
  const priceYes = toBig(o.priceYes, "priceYes");
  return {
    memberId: typeof o.memberId === "string" ? o.memberId : "",
    marketId: toBig(o.marketId, "marketId"),
    label: typeof o.label === "string" ? o.label : "",
    imageUrl: toNullableStr(o.imageUrl),
    status: o.status === "Pending" ? "Pending" : toStatus(o.status),
    outcome: toOutcome(o.outcome),
    priceYes,
    priceNo: PRICE_SCALE - priceYes,
    normalizedYes: toBig(o.normalizedYes, "normalizedYes"),
    volumeUsdc: toBig(o.volumeUsdc, "volumeUsdc"),
    closeTime: toUnixSeconds(o.closeTime, "closeTime"),
  };
}

export function normalizeGroup(raw: unknown): MarketGroup {
  const g = asRecord(raw);
  const outcomes = Array.isArray(g.outcomes)
    ? mapValid(g.outcomes, normalizeGroupOutcome, "outcome")
    : [];
  return {
    id: typeof g.id === "string" ? g.id : "",
    slug: typeof g.slug === "string" ? g.slug : "",
    title: typeof g.title === "string" ? g.title : "",
    category: toNullableStr(g.category),
    description: toNullableStr(g.description),
    rules: toNullableStr(g.rules),
    resolutionSource: toNullableStr(g.resolutionSource),
    imageUrl: toNullableStr(g.imageUrl),
    closeTime:
      typeof g.closeTime === "number" && Number.isFinite(g.closeTime)
        ? Math.floor(g.closeTime)
        : null,
    status: toGroupStatus(g.status),
    volumeUsdc: toBig(g.volumeUsdc, "volumeUsdc"),
    outcomeCount: outcomes.length,
    outcomes,
  };
}

export function normalizeGroups(raw: unknown): MarketGroup[] {
  return mapValid(raw, normalizeGroup, "group");
}

export function normalizeEventChart(raw: unknown): EventChartSeries[] {
  const r = asRecord(raw);
  if (!Array.isArray(r.outcomes)) return [];
  return mapValid(
    r.outcomes,
    (item) => {
      const o = asRecord(item);
      const points = Array.isArray(o.points)
        ? mapValid(
            o.points,
            (pt) => {
              const p = asRecord(pt);
              return { t: toUnixSeconds(p.t, "t"), yes: toBig(p.yes, "yes") };
            },
            "chart point"
          )
        : [];
      return {
        marketId: toBig(o.marketId, "marketId"),
        label: typeof o.label === "string" ? o.label : "",
        points,
      };
    },
    "event series"
  );
}

export function normalizeHolder(raw: unknown): Holder {
  const h = asRecord(raw);
  return {
    holder: typeof h.holder === "string" ? h.holder : "",
    shares: toBig(h.shares, "shares"),
    costUsdc: toBig(h.costUsdc, "costUsdc"),
    marketId: toBig(h.marketId, "marketId"),
  };
}

export function normalizeHolders(raw: unknown): Holder[] {
  return mapValid(raw, normalizeHolder, "holder");
}

const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "trade",
  "lp_add",
  "lp_remove",
  "redeem",
  "resolved",
];
function toActivityKind(value: unknown): ActivityKind {
  if (typeof value === "string" && (ACTIVITY_KINDS as readonly string[]).includes(value)) {
    return value as ActivityKind;
  }
  throw new PredictionApiError(MALFORMED, `Unknown activity kind "${String(value)}".`);
}

export function normalizeActivityItem(raw: unknown): ActivityItem {
  const a = asRecord(raw);
  return {
    id: typeof a.id === "string" ? a.id : "",
    txHash: typeof a.txHash === "string" ? a.txHash : "",
    kind: toActivityKind(a.kind),
    marketId: toBig(a.marketId, "marketId"),
    actor: typeof a.actor === "string" ? a.actor : "",
    side: a.side == null ? null : toSide(a.side),
    buy: typeof a.buy === "boolean" ? a.buy : null,
    usdcAmount: a.usdcAmount == null ? null : toBig(a.usdcAmount, "usdcAmount"),
    shareAmount: a.shareAmount == null ? null : toBig(a.shareAmount, "shareAmount"),
    priceYes: a.priceYes == null ? null : toBig(a.priceYes, "priceYes"),
    block: Number(toBig(a.block, "block")),
    at: toUnixMs(a.at, "at"),
  };
}

export function normalizeActivityPage(raw: unknown): ActivityPage {
  const p = asRecord(raw);
  return {
    items: Array.isArray(p.items) ? mapValid(p.items, normalizeActivityItem, "activity") : [],
    nextCursor: typeof p.nextCursor === "string" ? p.nextCursor : null,
  };
}

export function normalizeComment(raw: unknown): Comment {
  const c = asRecord(raw);
  return {
    id: typeof c.id === "string" ? c.id : "",
    wallet: typeof c.wallet === "string" ? c.wallet : "",
    body: typeof c.body === "string" ? c.body : "",
    parentId: toNullableStr(c.parentId),
    likeCount: typeof c.likeCount === "number" ? c.likeCount : 0,
    deleted: Boolean(c.deleted),
    at: toUnixMs(c.at, "at"),
  };
}

export function normalizeComments(raw: unknown): Comment[] {
  return mapValid(raw, normalizeComment, "comment");
}

export function normalizeQuote(raw: unknown): Quote {
  const q = asRecord(raw);
  return {
    kind: q.kind === "sell" ? "sell" : "buy",
    side: toSide(q.side),
    sharesOut: q.sharesOut == null ? undefined : toBig(q.sharesOut, "sharesOut"),
    usdcOut: q.usdcOut == null ? undefined : toBig(q.usdcOut, "usdcOut"),
    avgPriceCents: typeof q.avgPriceCents === "number" ? q.avgPriceCents : 0,
    priceYesBefore: toBig(q.priceYesBefore, "priceYesBefore"),
    priceYesAfter: toBig(q.priceYesAfter, "priceYesAfter"),
    priceImpactBps: toInt(q.priceImpactBps, "priceImpactBps"),
  };
}
