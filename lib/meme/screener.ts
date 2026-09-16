import { volumeFor } from "@/lib/meme/momentum";
import type { MemeTimeframe, MemeToken } from "@/lib/meme/types";

// The market screener's model, shared by the desk and the phone tab
// (ADR-2026-09-15-meme-trending-screener). Bounds are held as canonical
// decimal strings and compared exactly. The query string built here is both
// the request and the cache key, so equal filters always build the same one.

export const MEME_TIMEFRAMES: readonly MemeTimeframe[] = ["5m", "1h", "6h", "12h", "24h"];
export const DEFAULT_TIMEFRAME: MemeTimeframe = "24h";

export type ScreenerMetric =
  "marketCap" | "price" | "age" | "transactions" | "volume" | "traders" | "liquidity";

export const SCREENER_METRICS: readonly ScreenerMetric[] = [
  "marketCap",
  "price",
  "age",
  "transactions",
  "volume",
  "traders",
  "liquidity",
];

// The metrics the backend measures per timeframe. The others read the same in
// every window, so the timeframe is only sent when one of these is in play.
export const TIMEFRAME_SCOPED: ReadonlySet<ScreenerMetric> = new Set<ScreenerMetric>([
  "transactions",
  "volume",
  "traders",
]);

export type SortOrder = "asc" | "desc";

export interface ScreenerSort {
  by: ScreenerMetric;
  order: SortOrder;
}

// Canonical decimal strings, as parseBoundInput returns them.
export interface ScreenerBound {
  min?: string;
  max?: string;
}

export interface ScreenerFilters {
  bounds: Partial<Record<ScreenerMetric, ScreenerBound>>;
  sort: ScreenerSort | null;
}

// Frozen because it is shared: a caller that mutated it would change every
// screener's idea of "nothing applied".
export const EMPTY_FILTERS: ScreenerFilters = Object.freeze({
  bounds: Object.freeze({}),
  sort: null,
});

const PARAM_NAMES: Record<ScreenerMetric, string> = {
  marketCap: "MarketCapUsd",
  price: "PriceUsd",
  age: "AgeMinutes",
  transactions: "Transactions",
  volume: "VolumeUsd",
  traders: "Traders",
  liquidity: "LiquidityUsd",
};

// Digits with at most one point, then an optional k, m or b. Commas are
// stripped before this runs, wherever they sit: "1,000" and "10,00" both read
// as a thousand. Accepting only well-formed grouping would reject a figure a
// person pasted from somewhere that groups differently, for no gain.
const BOUND_INPUT = /^(\d*)(?:\.(\d*))?([kmb])?$/i;
const SUFFIX_DIGITS: Record<string, number> = { k: 3, m: 6, b: 9 };

/**
 * A typed bound as a canonical decimal string: "250k" is "250000", "1.5m" is
 * "1500000", " 007.50 " is "7.5". Empty input is "" (no bound). Null for
 * anything else, including a sign, an exponent or a word, since a screener
 * bound is never negative.
 */
export function parseBoundInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const match = BOUND_INPUT.exec(trimmed.replace(/,/g, ""));
  if (!match) return null;
  const [, whole, fraction = "", suffix] = match;
  if (whole === "" && fraction === "") return null;

  // Move the point right by the suffix's digits, padding the fraction first.
  const shift = suffix ? SUFFIX_DIGITS[suffix.toLowerCase()] : 0;
  const digits = whole + fraction.padEnd(shift, "0");
  const pointAt = whole.length + shift;
  const integer = digits.slice(0, pointAt).replace(/^0+/, "") || "0";
  const decimals = digits.slice(pointAt).replace(/0+$/, "");
  return decimals === "" ? integer : `${integer}.${decimals}`;
}

/** -1, 0 or 1 for two non-negative decimal strings, compared digit by digit. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const [aWhole = "", aFraction = ""] = a.split(".");
  const [bWhole = "", bFraction = ""] = b.split(".");
  const left = aWhole.replace(/^0+/, "");
  const right = bWhole.replace(/^0+/, "");
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left !== right) return left < right ? -1 : 1;
  const width = Math.max(aFraction.length, bFraction.length);
  const leftFraction = aFraction.padEnd(width, "0");
  const rightFraction = bFraction.padEnd(width, "0");
  if (leftFraction === rightFraction) return 0;
  return leftFraction < rightFraction ? -1 : 1;
}

export type BoundError = "notNumber" | "minAboveMax";

// The raw text in a metric's two inputs.
export interface BoundDraft {
  min: string;
  max: string;
}

export type ScreenerDraft = Record<ScreenerMetric, BoundDraft>;

type DraftErrors = Partial<Record<ScreenerMetric, { min?: BoundError; max?: BoundError }>>;

export function draftFrom(filters: ScreenerFilters): ScreenerDraft {
  const row = (metric: ScreenerMetric): BoundDraft => ({
    min: filters.bounds[metric]?.min ?? "",
    max: filters.bounds[metric]?.max ?? "",
  });
  return {
    marketCap: row("marketCap"),
    price: row("price"),
    age: row("age"),
    transactions: row("transactions"),
    volume: row("volume"),
    traders: row("traders"),
    liquidity: row("liquidity"),
  };
}

/**
 * Reads every input. The bounds to apply when all of them parse and no min is
 * above its max; otherwise the error for each field that failed. A min above
 * its max is reported on the min.
 */
export function readDraft(
  draft: ScreenerDraft
): { ok: true; bounds: ScreenerFilters["bounds"] } | { ok: false; errors: DraftErrors } {
  const bounds: ScreenerFilters["bounds"] = {};
  const errors: DraftErrors = {};
  for (const metric of SCREENER_METRICS) {
    const min = parseBoundInput(draft[metric].min);
    const max = parseBoundInput(draft[metric].max);
    if (min === null || max === null) {
      errors[metric] = {
        ...(min === null ? { min: "notNumber" as const } : {}),
        ...(max === null ? { max: "notNumber" as const } : {}),
      };
      continue;
    }
    if (min !== "" && max !== "" && compareDecimal(min, max) > 0) {
      errors[metric] = { min: "minAboveMax" };
      continue;
    }
    if (min === "" && max === "") continue;
    bounds[metric] = { ...(min === "" ? {} : { min }), ...(max === "" ? {} : { max }) };
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, bounds };
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

export function hasBounds(f: ScreenerFilters): boolean {
  return SCREENER_METRICS.some((metric) => {
    const bound = f.bounds[metric];
    return isSet(bound?.min) || isSet(bound?.max);
  });
}

/** True when a sort or any bound is applied: the backend's own rule for a filtered list. */
export function screenerActive(f: ScreenerFilters): boolean {
  return f.sort !== null || hasBounds(f);
}

/** One for each set min, one for each set max, and one for a sort. */
export function activeCount(f: ScreenerFilters): number {
  let count = f.sort === null ? 0 : 1;
  for (const metric of SCREENER_METRICS) {
    const bound = f.bounds[metric];
    if (isSet(bound?.min)) count += 1;
    if (isSet(bound?.max)) count += 1;
  }
  return count;
}

/**
 * Whether the result depends on the timeframe: a bound on a scoped metric, or,
 * when the sort is sent too, a sort by one.
 */
export function usesTimeframe(f: ScreenerFilters, withSort: boolean): boolean {
  const scopedBound = SCREENER_METRICS.some((metric) => {
    const bound = f.bounds[metric];
    return TIMEFRAME_SCOPED.has(metric) && (isSet(bound?.min) || isSet(bound?.max));
  });
  return scopedBound || (withSort && f.sort !== null && TIMEFRAME_SCOPED.has(f.sort.by));
}

function boundParams(f: ScreenerFilters): [string, string][] {
  const params: [string, string][] = [];
  for (const metric of SCREENER_METRICS) {
    const bound = f.bounds[metric];
    if (isSet(bound?.min)) params.push([`min${PARAM_NAMES[metric]}`, bound.min]);
    if (isSet(bound?.max)) params.push([`max${PARAM_NAMES[metric]}`, bound.max]);
  }
  return params;
}

// Sorted by code unit rather than locale, so the key is the same in every
// browser and on the server.
function canonicalQuery(params: [string, string][]): string {
  const sorted = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(sorted).toString();
}

/**
 * The list's query, without a leading "?": sorted keys and canonical names,
 * e.g. "maxMarketCapUsd=1000000&sortBy=volume&sortOrder=desc&timeframe=1h".
 * Empty when nothing is applied. The timeframe is sent only when the result
 * depends on it, so switching the window for display alone never refetches.
 */
export function screenerQuery(f: ScreenerFilters, timeframe: MemeTimeframe): string {
  if (!screenerActive(f)) return "";
  const params = boundParams(f);
  if (f.sort !== null) params.push(["sortBy", f.sort.by], ["sortOrder", f.sort.order]);
  if (usesTimeframe(f, true)) params.push(["timeframe", timeframe]);
  return canonicalQuery(params);
}

/**
 * Trending's query: the bounds and, for a scoped bound, the timeframe, but
 * never the sort. Trending stays ranked by activity and a sort only reorders
 * the table. Empty when no bound is applied.
 */
export function trendingQuery(f: ScreenerFilters, timeframe: MemeTimeframe): string {
  if (!hasBounds(f)) return "";
  const params = boundParams(f);
  if (usesTimeframe(f, false)) params.push(["timeframe", timeframe]);
  return canonicalQuery(params);
}

export type ScreenerPresetId = "fresh" | "movers" | "micro" | "deep" | "crowd";

function preset(
  id: ScreenerPresetId,
  bounds: ScreenerFilters["bounds"],
  sort: ScreenerSort | null
): { id: ScreenerPresetId; filters: ScreenerFilters } {
  return Object.freeze({ id, filters: Object.freeze({ bounds, sort }) });
}

// Plain bounds and a sort, with no hidden logic. Age sorts ascending for
// newest first, since a younger pair has fewer minutes.
export const SCREENER_PRESETS: readonly { id: ScreenerPresetId; filters: ScreenerFilters }[] =
  Object.freeze([
    preset("fresh", { age: { max: "60" } }, { by: "age", order: "asc" }),
    preset("movers", {}, { by: "volume", order: "desc" }),
    preset("micro", { marketCap: { max: "1000000" } }, null),
    preset("deep", { liquidity: { min: "100000" } }, null),
    preset("crowd", {}, { by: "traders", order: "desc" }),
  ]);

function sameFilters(a: ScreenerFilters, b: ScreenerFilters): boolean {
  if (a.sort?.by !== b.sort?.by || a.sort?.order !== b.sort?.order) return false;
  return SCREENER_METRICS.every((metric) => {
    const left = a.bounds[metric];
    const right = b.bounds[metric];
    return (
      (isSet(left?.min) ? left.min : "") === (isSet(right?.min) ? right.min : "") &&
      (isSet(left?.max) ? left.max : "") === (isSet(right?.max) ? right.max : "")
    );
  });
}

/** The preset these filters are exactly, or null when they differ in any bound or the sort. */
export function presetFor(f: ScreenerFilters): ScreenerPresetId | null {
  return SCREENER_PRESETS.find((p) => sameFilters(p.filters, f))?.id ?? null;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const proto: unknown = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function hasOnlyKeys(x: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(x).every((key) => allowed.includes(key));
}

function isMetric(x: unknown): x is ScreenerMetric {
  return typeof x === "string" && (SCREENER_METRICS as readonly string[]).includes(x);
}

// A stored bound value must be exactly what parseBoundInput would have
// produced, so a hand-edited or stale entry cannot reach the query.
function isCanonicalBound(x: unknown): boolean {
  return x === undefined || (typeof x === "string" && x !== "" && parseBoundInput(x) === x);
}

function isBound(x: unknown): x is ScreenerBound {
  if (!isPlainObject(x) || !hasOnlyKeys(x, ["min", "max"])) return false;
  if (!isCanonicalBound(x.min) || !isCanonicalBound(x.max)) return false;
  return (
    typeof x.min !== "string" || typeof x.max !== "string" || compareDecimal(x.min, x.max) <= 0
  );
}

function isSort(x: unknown): x is ScreenerSort {
  return (
    isPlainObject(x) &&
    hasOnlyKeys(x, ["by", "order"]) &&
    isMetric(x.by) &&
    (x.order === "asc" || x.order === "desc")
  );
}

/**
 * A guard for filters restored from sessionStorage. Only exactly the filters
 * shape passes: known metrics, canonical values, no min above its max, and a
 * known sort or null.
 */
export function isScreenerFilters(x: unknown): x is ScreenerFilters {
  if (!isPlainObject(x) || !hasOnlyKeys(x, ["bounds", "sort"])) return false;
  if (!("bounds" in x) || !("sort" in x)) return false;
  const { bounds, sort } = x;
  if (!isPlainObject(bounds)) return false;
  const boundsOk = Object.entries(bounds).every(
    ([metric, bound]) => isMetric(metric) && isBound(bound)
  );
  return boundsOk && (sort === null || isSort(sort));
}

export function isMemeTimeframe(x: unknown): x is MemeTimeframe {
  return typeof x === "string" && (MEME_TIMEFRAMES as readonly string[]).includes(x);
}

/** Whole minutes since the pair was created, or null for a missing, unreadable or future time. */
export function ageMinutes(pairCreatedAt: string | null | undefined, now: number): number | null {
  if (pairCreatedAt === null || pairCreatedAt === undefined) return null;
  const createdAt = Date.parse(pairCreatedAt);
  if (Number.isNaN(createdAt) || createdAt > now) return null;
  return Math.floor((now - createdAt) / 60_000);
}

/**
 * The figure the table's extra column shows for a sort metric. Money stays a
 * decimal string; counts and age are numbers. Windowed metrics read the
 * selected window, and only volume at 24h falls back to the flat field.
 */
export function metricValue(
  token: MemeToken,
  metric: ScreenerMetric,
  timeframe: MemeTimeframe,
  now: number
):
  | { kind: "usd"; value: string | null }
  | { kind: "count"; value: number | null }
  | { kind: "age"; minutes: number | null } {
  switch (metric) {
    case "marketCap":
      return { kind: "usd", value: token.marketCapUsd };
    case "price":
      return { kind: "usd", value: token.priceUsd };
    case "liquidity":
      return { kind: "usd", value: token.liquidityUsd };
    case "volume":
      return { kind: "usd", value: volumeFor(token, timeframe) };
    case "transactions":
      return { kind: "count", value: token.activity?.[timeframe]?.transactions ?? null };
    case "traders":
      return { kind: "count", value: token.activity?.[timeframe]?.traders ?? null };
    case "age":
      return { kind: "age", minutes: ageMinutes(token.pairCreatedAt, now) };
  }
}

// ---------------------------------------------------------------------------
// The client-side fallback
// ---------------------------------------------------------------------------
//
// The backend accepts every bound and sort below and, as of 2026-09-16, acts on
// none of them: `GET /tokens?maxMarketCapUsd=1000` answers with cbBTC at a
// $3.49bn market cap, and `sortBy=volume&sortOrder=desc` returns the catalogue's
// own order. The query is still sent, because the moment the service does honour
// it the work stops happening here and the paging is right.
//
// Applying the same predicate to whatever comes back is idempotent: a list the
// backend has already filtered passes through unchanged, so this is safe before
// and after that deploy, with no feature detection to get wrong.
//
// The ADR's own warning is what this exists for: "the app must never send a
// value it has not validated itself, or the table would silently show an
// unfiltered list."

/**
 * A metric as one comparable decimal string, or null when the service could not
 * report it. Reads through the same `metricValue` the table's extra column
 * uses, so a bound and the figure beside it can never disagree.
 */
function comparableMetric(
  token: MemeToken,
  metric: ScreenerMetric,
  timeframe: MemeTimeframe,
  now: number
): string | null {
  const read = metricValue(token, metric, timeframe, now);
  if (read.kind === "usd") return read.value;
  if (read.kind === "count") return read.value === null ? null : String(read.value);
  return read.minutes === null ? null : String(read.minutes);
}

/**
 * True when `token` satisfies every bound in `filters`.
 *
 * A metric the service could not report is NOT a match for a bound on it. Asked
 * for a market cap under a million, a coin whose market cap is unknown has not
 * been shown to qualify, and the contract is explicit that null means "not
 * currently available", never zero — treating it as 0 would slip unpriced coins
 * into every "under" filter.
 */
export function matchesBounds(
  token: MemeToken,
  filters: ScreenerFilters,
  timeframe: MemeTimeframe,
  now: number = Date.now()
): boolean {
  for (const metric of SCREENER_METRICS) {
    const bound = filters.bounds[metric];
    if (!isSet(bound?.min) && !isSet(bound?.max)) continue;
    const value = comparableMetric(token, metric, timeframe, now);
    if (value === null) return false;
    if (isSet(bound?.min) && compareDecimal(value, bound.min) < 0) return false;
    if (isSet(bound?.max) && compareDecimal(value, bound.max) > 0) return false;
  }
  return true;
}

/**
 * `tokens` sorted by `sort`, stably, with unreadable values last in both
 * directions.
 *
 * Last in both directions is deliberate: a coin the service cannot measure is
 * not the smallest, and ascending order must not open with a wall of unknowns.
 */
export function sortTokens(
  tokens: readonly MemeToken[],
  sort: ScreenerSort,
  timeframe: MemeTimeframe,
  now: number = Date.now()
): MemeToken[] {
  const decorated = tokens.map((token, index) => ({
    token,
    index,
    value: comparableMetric(token, sort.by, timeframe, now),
  }));
  decorated.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    const order = compareDecimal(a.value, b.value);
    if (order !== 0) return sort.order === "asc" ? order : -order;
    return a.index - b.index;
  });
  return decorated.map((row) => row.token);
}

/**
 * `tokens` as the screener describes them: bounds applied, then the sort.
 *
 * A no-op when nothing is applied, so an unfiltered list keeps the backend's
 * own order and identity.
 */
export function applyScreener(
  tokens: readonly MemeToken[],
  filters: ScreenerFilters,
  timeframe: MemeTimeframe,
  now: number = Date.now()
): MemeToken[] {
  if (!screenerActive(filters)) return tokens as MemeToken[];
  const kept = hasBounds(filters)
    ? tokens.filter((token) => matchesBounds(token, filters, timeframe, now))
    : (tokens as MemeToken[]);
  return filters.sort === null ? [...kept] : sortTokens(kept, filters.sort, timeframe, now);
}
