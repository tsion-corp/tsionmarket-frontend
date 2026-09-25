import { exactDecimal, type ExactDecimal } from "@/lib/meme/momentum";
import { fromBaseUnits } from "@/lib/trade/math";

// Display helpers for the trade service's decimal strings. The contract's
// rule, applied here once: null means "not currently available". It is never
// coerced to zero, and a real zero is never hidden as if it were missing.

/** What every helper here draws for a figure the service did not publish. */
export const MISSING_FIGURE = "—";

export type ChangeDirection = "up" | "down";

/**
 * The direction of a signed percentage-point change, or null when the service
 * published none. A null change draws neutral: never green, never red.
 */
export function changeDirection(value: string | null | undefined): ChangeDirection | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= 0 ? "up" : "down";
}

/** A chart's `up` flag for a change: null, drawn neutral, when none was published. */
export function chartUp(value: string | null | undefined): boolean | null {
  const direction = changeDirection(value);
  return direction === null ? null : direction === "up";
}

// ---------------------------------------------------------------------------
// Compact figures
// ---------------------------------------------------------------------------
//
// A memecoin catalogue carries figures of every size at once: a $3.49bn market
// cap on one row, 1,284,339 transactions on the next, a price of
// 0.00000000121. Written out, any of them is wider than the cell it sits in,
// and the row that overflows is the row a reader cannot read.
//
// So every figure below is compacted to a bounded width, and all of it happens
// on the service's decimal strings through bigints. Nothing here goes near a
// float: `Number("1887590.12")` is close enough for a suffix, but the rounding
// that picks between "$1.88M" and "$1.89M" is money arithmetic and the repo's
// rule for money arithmetic has no exceptions.

const TIERS: readonly { exponent: number; suffix: string }[] = [
  { exponent: 12, suffix: "T" },
  { exponent: 9, suffix: "B" },
  { exponent: 6, suffix: "M" },
  { exponent: 3, suffix: "K" },
];

/** Whether |value| is at least 10^exponent. A negative exponent is a fraction. */
function atLeastPow10(value: ExactDecimal, exponent: number): boolean {
  const magnitude = value.units < 0n ? -value.units : value.units;
  // Both sides are scaled up rather than either being divided down, so no
  // digit is dropped before the comparison.
  const left = exponent >= 0 ? magnitude : magnitude * 10n ** BigInt(-exponent);
  const right = 10n ** BigInt(exponent >= 0 ? exponent + value.scale : value.scale);
  return left >= right;
}

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * |value| with its point shifted `shift` places left, rounded half away from
 * zero to `digits` decimals, keeping at least `minDigits` of them.
 *
 * The shift is what turns 1,887,590 into the "1.89" that precedes an "M", and
 * doing it here rather than by dividing means the rounding sees every digit.
 */
function shifted(value: ExactDecimal, shift: number, digits: number, minDigits = 0): string {
  const magnitude = value.units < 0n ? -value.units : value.units;
  const drop = value.scale + shift - digits;
  const units =
    drop > 0
      ? (magnitude + 10n ** BigInt(drop) / 2n) / 10n ** BigInt(drop)
      : magnitude * 10n ** BigInt(-drop);
  if (digits === 0) return group(units.toString());
  const base = 10n ** BigInt(digits);
  const whole = group((units / base).toString());
  let fraction = (units % base).toString().padStart(digits, "0");
  while (fraction.length > minDigits && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return fraction ? `${whole}.${fraction}` : whole;
}

// The smallest figure written out in full. Below it the cents would all be
// zero, which reads as no money at all, so the label says "under a cent"
// instead. The wording is lib/currencies' own, so the two agree on screen.
function underACent(negative: boolean): string {
  return negative ? ">-$0.01" : "<$0.01";
}

/**
 * Compact USD for market stats: "$1.89M", "$56.7K", "$123.45", "<$0.01".
 *
 * A real "0" is "$0" and only a missing or unreadable figure is a dash, which
 * is the contract's rule and what the callers testing for the dash rely on.
 * Two decimals at most, trailing zeros trimmed, so nothing here runs past
 * eight characters.
 */
export function compactUsd(value: string | null): string {
  const figure = exactDecimal(value);
  if (figure === null) return MISSING_FIGURE;
  if (figure.units === 0n) return "$0";
  const sign = figure.units < 0n ? "-" : "";
  for (const tier of TIERS) {
    if (atLeastPow10(figure, tier.exponent)) {
      return `${sign}$${shifted(figure, tier.exponent, 2)}${tier.suffix}`;
    }
  }
  if (!atLeastPow10(figure, -2)) return underACent(figure.units < 0n);
  return `${sign}$${shifted(figure, 0, 2)}`;
}

// Counts group up to a million and compact above it. Money compacts from a
// thousand because a market cap's exact dollars are noise, but a transaction
// count means something to the unit, and "123,456" is no wider than the
// "123.46K" that would replace it. Both stop at seven characters.
const COUNT_COMPACT_FROM = 1_000_000;

/**
 * A transaction or trader count as a column shows it: "842", "123,456",
 * "1.23M". A missing count is a dash, never 0.
 */
export function compactCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING_FIGURE;
  const whole = Math.trunc(value);
  if (Math.abs(whole) < COUNT_COMPACT_FROM) return group(whole.toString());
  // A count arrives as a JSON integer, so its digits are exact and the tiers
  // below run on it through the same bigint path the money figures use.
  const figure: ExactDecimal = { units: BigInt(whole), scale: 0 };
  const sign = whole < 0 ? "-" : "";
  for (const tier of TIERS) {
    if (atLeastPow10(figure, tier.exponent)) {
      return `${sign}${shifted(figure, tier.exponent, 2)}${tier.suffix}`;
    }
  }
  return `${sign}${shifted(figure, 0, 0)}`;
}

/**
 * A signed percentage as the cards and rows print it: "+12.50%", "-4.20%",
 * "+12.35K%".
 *
 * Points arrive as points ("12.5" is +12.5%), so nothing here multiplies or
 * divides by a hundred. A memecoin can genuinely run to five figures of gain
 * and "+12345.67%" is wider than the card it sits on, so from 1000 points up
 * the same tiers apply. Null for a missing or unreadable change, which the
 * caller draws as a dash rather than as a flat 0%.
 */
export function compactPercentPoints(value: string | null | undefined): string | null {
  const figure = exactDecimal(value);
  if (figure === null) return null;
  const sign = figure.units < 0n ? "-" : "+";
  for (const tier of TIERS) {
    if (atLeastPow10(figure, tier.exponent)) {
      return `${sign}${shifted(figure, tier.exponent, 2)}${tier.suffix}%`;
    }
  }
  // Both decimals are kept below the first tier: a change is read against the
  // ones beside it, and a column of "+1.5%" against "+1.53%" does not line up.
  return `${sign}${shifted(figure, 0, 2, 2)}%`;
}

// Every platform fee settles in USDC, on Base and on Solana alike (the
// contract's "Platform fees"). The preview names the fee's amount but not its
// token, so the symbol is the contract's rule stated once here, not a guess
// made per surface. The rate is never stated anywhere: the fee shown is always
// the one the preview or quote returned.
export const PLATFORM_FEE_SYMBOL = "USDC";
const USDC_DECIMALS = 6;
const BASE_UNITS = /^\d+$/;

/**
 * A USDC amount in base units ("2500") as a decimal string ("0.0025"), through
 * a bigint so no base unit is lost however long the figure runs. Null for
 * anything that is not a whole number of base units: an unreadable fee is not
 * shown rather than shown wrong.
 */
/** The fee as a ticket shows it: the service's own figure, in USDC. */
export function platformFeeText(formatted: string): string {
  return `${formatted} ${PLATFORM_FEE_SYMBOL}`;
}

export function formatUsdcAtomic(atomic: string): string | null {
  const cleaned = atomic.trim();
  if (!BASE_UNITS.test(cleaned)) return null;
  return fromBaseUnits(BigInt(cleaned), USDC_DECIMALS);
}

// A position's mark is labelled stale once it is older than this. The
// contract asks for marketDataUpdatedAt to be shown or used to label stale
// prices, without naming a threshold; fifteen minutes is this app's, stated
// once here (ADR-2026-09-14-memecoins-trade-contract, slice 5).
export const MARKET_DATA_STALE_MS = 15 * 60_000;

export type MarketDataAge =
  { kind: "none" } | { kind: "fresh"; minutes: number } | { kind: "stale"; minutes: number };

/**
 * How old a position's market data is at `now`: "none" when the service has
 * no timestamp (or an unreadable one), otherwise its whole-minute age, stale
 * past MARKET_DATA_STALE_MS.
 */
export function marketDataAge(updatedAt: string | null, now: number): MarketDataAge {
  if (updatedAt === null) return { kind: "none" };
  const at = Date.parse(updatedAt);
  if (Number.isNaN(at)) return { kind: "none" };
  const age = Math.max(0, now - at);
  const minutes = Math.floor(age / 60_000);
  return age > MARKET_DATA_STALE_MS ? { kind: "stale", minutes } : { kind: "fresh", minutes };
}
