import { catalogKey } from "@/lib/meme/catalog";
import type { MemeTimeframe, MemeToken } from "@/lib/meme/types";

// The Trending card's gamified reads over a coin's change and volume. Every
// judgement runs on the service's decimal strings as scaled bigints, so a
// threshold, a ratio or a ranking never depends on how a float rounds.

// A decimal string as an exact fraction: units / 10^scale.
export interface ExactDecimal {
  units: bigint;
  scale: number;
}

// The service writes its figures the way a JS number prints, so a very small
// or very large one arrives in exponent form ("1.21495281918e-9" is a live
// price). That is read exactly too. The exponent is bounded so a hostile
// string cannot ask for a bigint with a million digits; a JS number never
// needs more than about 324.
const SERVICE_DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,4}))?$/;
const MAX_EXPONENT = 400;

/**
 * A decimal string from the service as an exact fraction, or null for a
 * missing or unreadable one (a word, an empty string, several points).
 */
export function exactDecimal(value: string | null | undefined): ExactDecimal | null {
  if (value === null || value === undefined) return null;
  const match = SERVICE_DECIMAL.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, fraction = "", exponentText] = match;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (Math.abs(exponent) > MAX_EXPONENT) return null;
  let units = BigInt(whole + fraction);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { units: sign === "-" ? -units : units, scale };
}

// Both fractions at the larger of their two scales, so they compare as
// plain bigints.
function aligned(a: ExactDecimal, b: ExactDecimal): [bigint, bigint] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * 10n ** BigInt(scale - a.scale), b.units * 10n ** BigInt(scale - b.scale)];
}

function atLeast(value: ExactDecimal, whole: number): boolean {
  return value.units >= BigInt(whole) * 10n ** BigInt(value.scale);
}

function atMost(value: ExactDecimal, whole: number): boolean {
  return value.units <= BigInt(whole) * 10n ** BigInt(value.scale);
}

/**
 * The change for a window, in percentage points. Only 24h falls back to the
 * flat field, because that is the same measurement; no other window is ever
 * estimated from a different one.
 */
export function changeFor(token: MemeToken, timeframe: MemeTimeframe): string | null {
  const change = token.activity?.[timeframe]?.priceChangePercent ?? null;
  return timeframe === "24h" ? (change ?? token.priceChange24hPercent) : change;
}

/** The USD volume for a window, with the same 24h-only fallback as changeFor. */
export function volumeFor(token: MemeToken, timeframe: MemeTimeframe): string | null {
  const volume = token.activity?.[timeframe]?.volumeUsd ?? null;
  return timeframe === "24h" ? (volume ?? token.volume24hUsd) : volume;
}

export type Momentum = "mooning" | "pumping" | "cooling" | "dumping";

/**
 * A word for the move: mooning from +50, pumping from +10, cooling from -10,
 * dumping from -30, each edge inclusive. A small move gets no word, and a
 * missing change is never called flat.
 */
export function momentumOf(change: string | null): Momentum | null {
  const value = exactDecimal(change);
  if (value === null) return null;
  if (atLeast(value, 50)) return "mooning";
  if (atLeast(value, 10)) return "pumping";
  if (atMost(value, -30)) return "dumping";
  if (atMost(value, -10)) return "cooling";
  return null;
}

/**
 * The width, 0 to 100, of the change bar under a percentage: the size of the
 * move in whole points, capped at 100.
 */
export function changeBarPercent(change: string | null): number | null {
  const value = exactDecimal(change);
  if (value === null) return null;
  const magnitude = value.units < 0n ? -value.units : value.units;
  const points = magnitude / 10n ** BigInt(value.scale);
  return points >= 100n ? 100 : Number(points);
}

/**
 * Each coin's volume as a whole percentage of the busiest coin's, keyed by
 * catalogKey. A coin with no readable volume maps to null, never to 0. When
 * every known volume is 0 there is no busiest coin, so they all map to 0.
 */
export function heatShares(
  tokens: MemeToken[],
  timeframe: MemeTimeframe
): Map<string, number | null> {
  const volumes = tokens.map((token) => {
    const volume = exactDecimal(volumeFor(token, timeframe));
    // A negative volume is not a reading of anything, so it is not ranked.
    return { key: catalogKey(token), volume: volume && volume.units >= 0n ? volume : null };
  });
  const scale = Math.max(0, ...volumes.map(({ volume }) => volume?.scale ?? 0));
  const scaled = volumes.map(({ key, volume }) => ({
    key,
    units: volume === null ? null : volume.units * 10n ** BigInt(scale - volume.scale),
  }));
  const busiest = scaled.reduce(
    (max, { units }) => (units !== null && units > max ? units : max),
    0n
  );

  const shares = new Map<string, number | null>();
  for (const { key, units } of scaled) {
    if (units === null) shares.set(key, null);
    else shares.set(key, busiest === 0n ? 0 : Number((units * 100n) / busiest));
  }
  return shares;
}

/**
 * Up to `n` coins that gained in the window, highest change first. A tie
 * keeps the order the coins were given in; a coin that is flat, down or has
 * no change is never a top gainer.
 */
export function topGainerKeys(tokens: MemeToken[], timeframe: MemeTimeframe, n = 3): Set<string> {
  const gainers = tokens.flatMap((token) => {
    const change = exactDecimal(changeFor(token, timeframe));
    return change !== null && change.units > 0n ? [{ key: catalogKey(token), change }] : [];
  });
  // Array.prototype.sort is stable, so equal changes keep their input order.
  gainers.sort((a, b) => {
    const [left, right] = aligned(a.change, b.change);
    return left === right ? 0 : left > right ? -1 : 1;
  });

  const keys = new Set<string>();
  for (const { key } of gainers) {
    if (keys.size >= n) break;
    keys.add(key);
  }
  return keys;
}
