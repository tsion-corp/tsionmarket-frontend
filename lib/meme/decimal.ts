import { toBaseUnits } from "@/lib/trade/math";

// Arithmetic on the trade service's decimal strings, for the portfolio.
//
// The contract sends every quantity, USD amount, price and percentage as a
// decimal string and says not to do financial work with binary floats. The
// screen needs four things from those strings: a sign, a comparison, a
// rounding and a grouping. All four run here on a bigint scaled to 18 decimal
// places (lib/trade/math's toBaseUnits), so a figure past 2^53 keeps every
// digit. A float is never produced, and a null is never turned into a zero:
// every formatter returns null for a missing figure and the caller says
// "Valuation unavailable" or "—" in its own words.

const SCALE = 18;
const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;
const ONE = 10n ** BigInt(SCALE);

// The string as a signed bigint at 18 decimal places, or null when it is not a
// plain decimal (an exponent, a localized figure, an empty string).
function scaled(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, fraction] = match;
  const magnitude = toBaseUnits(fraction ? `${whole}.${fraction}` : whole, SCALE);
  return sign === "-" ? -magnitude : magnitude;
}

/** -1, 0 or 1 for a decimal string; null when there is no figure to judge. */
export function signOf(value: string | null | undefined): -1 | 0 | 1 | null {
  const n = scaled(value);
  if (n === null) return null;
  return n > 0n ? 1 : n < 0n ? -1 : 0;
}

// |n| rounded half away from zero to `digits` places, as a count of units at
// that precision.
function roundAbs(n: bigint, digits: number): bigint {
  const abs = n < 0n ? -n : n;
  const step = 10n ** BigInt(SCALE - digits);
  return (abs + step / 2n) / step;
}

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Units at `digits` places as "1,234.5", keeping at least `minDigits`.
function render(units: bigint, digits: number, minDigits: number): string {
  const base = 10n ** BigInt(digits);
  const whole = group((units / base).toString());
  if (digits === 0) return whole;
  let fraction = (units % base).toString().padStart(digits, "0");
  while (fraction.length > minDigits && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return fraction ? `${whole}.${fraction}` : whole;
}

// Places for a figure below one: enough to keep four significant digits, so a
// memecoin price of $0.0000012345 reads $0.000001235 and never rounds to zero.
// A figure of one or more uses `wholePlaces`.
const SIGNIFICANT = 4;

function placesFor(n: bigint, wholePlaces: number): number {
  const abs = n < 0n ? -n : n;
  if (abs >= ONE || abs === 0n) return wholePlaces;
  const leadingZeros = abs.toString().padStart(SCALE, "0").search(/[1-9]/);
  return Math.min(SCALE, leadingZeros + SIGNIFICANT);
}

function signPrefix(units: bigint, n: bigint, signed: boolean): string {
  if (units === 0n) return "";
  if (n < 0n) return "-";
  return signed ? "+" : "";
}

/**
 * A USD decimal string for display: "$1,234.50", "-$12.30", "+$12.30" with
 * `signed`. Cents from a dollar up, four significant digits below. The sign
 * goes before the symbol. Null for a null or unreadable figure, never "$0".
 */
export function formatUsdString(
  value: string | null | undefined,
  { signed = false }: { signed?: boolean } = {}
): string | null {
  const n = scaled(value);
  if (n === null) return null;
  const digits = placesFor(n, 2);
  const units = roundAbs(n, digits);
  return `${signPrefix(units, n, signed)}$${render(units, digits, 2)}`;
}

/**
 * Percentage points as the contract sends them ("32" is +32%, not 0.32%):
 * two places at most, an explicit + on a gain, the minus kept on a loss, no
 * sign on zero. Null for a null return, which is never "-100%".
 */
export function formatPercentPoints(value: string | null | undefined): string | null {
  const n = scaled(value);
  if (n === null) return null;
  const units = roundAbs(n, 2);
  return `${signPrefix(units, n, true)}${render(units, 2, 0)}%`;
}

/**
 * A token quantity: grouped, up to four places from one coin up and four
 * significant digits below, trailing zeros trimmed. A fraction of a coin is
 * never shown as 0. Null for an unreadable string.
 */
export function formatQuantity(value: string | null | undefined): string | null {
  const n = scaled(value);
  if (n === null) return null;
  const digits = placesFor(n, 4);
  const units = roundAbs(n, digits);
  return `${signPrefix(units, n, false)}${render(units, digits, 0)}`;
}
