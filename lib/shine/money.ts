// The only figures a Shine post is allowed to contain, and the only way to
// build one.
//
// A Shine post is published with no confirmation step, so there is no moment
// where a person sees a wrong number and stops it, and no deep link means
// there is nothing to correct it with afterwards. The defence is the type
// system: a composer accepts an `EntryPrice`, a `PnlPercent` or an `Odds`, and
// none of those can be produced from a bare string or number. A balance, a
// position size or a trade amount has no constructor here at all, so it cannot
// be handed to a composer even by mistake.
//
// Each branded type IS the rendered text ("$0.0000042", "+45.2%"), so a
// composer interpolates it and never formats a number itself.
//
// All arithmetic runs on bigint base units through lib/meme/decimal and
// lib/trade/math. No float is produced at any point: a memecoin price of
// 0.00000420000000000001 loses its last digits to a double before any
// formatting runs, and the price is the part of the post that has to stay true
// forever.

import { formatPercentPoints, formatUsdString, signOf } from "@/lib/meme/decimal";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

declare const entryPriceBrand: unique symbol;
declare const pnlPercentBrand: unique symbol;
declare const oddsBrand: unique symbol;

/** A price per unit, rendered for display. Never a total and never a size. */
export type EntryPrice = string & { readonly [entryPriceBrand]: true };

/** A realised return as a percentage. Only ever set where an outcome exists. */
export type PnlPercent = string & { readonly [pnlPercentBrand]: true };

/** Decimal odds on a settled or placed bet slip. */
export type Odds = string & { readonly [oddsBrand]: true };

const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Divide, rounding half away from zero. `den` must be positive. */
function divRound(num: bigint, den: bigint): bigint {
  const negative = num < 0n;
  const abs = negative ? -num : num;
  const quotient = (abs * 2n + den) / (den * 2n);
  return negative ? -quotient : quotient;
}

/** Hundredths as "-31.03", which is what formatPercentPoints takes. */
function hundredthsToDecimal(hundredths: bigint): string {
  const negative = hundredths < 0n;
  const abs = negative ? -hundredths : hundredths;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${abs / 100n}.${fraction}`;
}

/**
 * A price from the decimal string a service sent, or null when it is not a
 * positive plain decimal.
 *
 * Null rather than a guess: a post that omits the price still says something
 * true, and a post that states the wrong one cannot be taken back.
 */
export function entryPriceFromUsdString(usd: string | null | undefined): EntryPrice | null {
  if (signOf(usd) !== 1) return null;
  const rendered = formatUsdString(usd);
  return rendered === null ? null : (rendered as EntryPrice);
}

/** A price held as integer base units, the form that keeps every digit. */
export function entryPriceFromBaseUnits(raw: bigint, decimals: number): EntryPrice | null {
  if (raw <= 0n) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return entryPriceFromUsdString(fromBaseUnits(raw, decimals));
}

/**
 * A return computed from the entry and exit in the SAME base units.
 *
 * Both sides stay bigint the whole way, so a position priced past 2^53 gives
 * the same percentage as a small one.
 */
export function pnlPercentFromBaseUnits(entryRaw: bigint, exitRaw: bigint): PnlPercent | null {
  if (entryRaw <= 0n) return null;
  // Hundredths of a percent: two places is all the post shows.
  const hundredths = divRound((exitRaw - entryRaw) * 10_000n, entryRaw);
  return pnlPercentFromPoints(hundredthsToDecimal(hundredths));
}

/**
 * A return a service already computed, as percentage POINTS ("45.2" is
 * +45.2%, not 0.452%), matching the trade contract lib/meme/decimal reads.
 */
export function pnlPercentFromPoints(points: string | null | undefined): PnlPercent | null {
  const rendered = formatPercentPoints(points);
  return rendered === null ? null : (rendered as PnlPercent);
}

/** Decimal odds above 1.00, to two places. */
export function oddsFromDecimalString(value: string | null | undefined): Odds | null {
  if (typeof value !== "string" || !PLAIN_DECIMAL.test(value.trim())) return null;
  const hundredths = divRound(toBaseUnits(value.trim(), 4), 100n);
  if (hundredths <= 100n) return null;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}` as Odds;
}
