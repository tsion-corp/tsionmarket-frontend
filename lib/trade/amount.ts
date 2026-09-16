import { toBaseUnits } from "@/lib/trade/math";

// What a trade ticket's amount field accepts, and what it makes of what was
// typed. Pure string and bigint work, no React, so both the field that marks an
// amount and the action that refuses to send it read one verdict and cannot
// disagree about whether a figure is spendable.
//
// Money rules this file follows, and the reason for each:
//
//   * An amount is a decimal string ("12.345678"), never a number. Parsing it
//     to a float and printing it back loses digits at 17 significant figures,
//     which is inside the range a USDC balance reaches.
//   * A balance arrives as bigint base units, so nothing here parses a balance.
//     Comparing the amount to it converts the amount and compares two bigints.
//   * Formatting for display works on the digits of the string: group the whole
//     part, cut the fraction. No arithmetic, so nothing to round.

// Digits with at most one decimal point. A leading point is allowed so a
// fraction can be typed from the left ("." then ".5"); toBaseUnits reads it.
const DECIMAL_INPUT = /^\d*\.?\d*$/;

// A long enough entry is a paste of something that is not an amount. Cap it so
// a runaway string never reaches BigInt().
const MAX_AMOUNT_LENGTH = 32;

export type AmountStatus = "empty" | "invalid" | "too-precise" | "above-balance" | "ok";

// Fraction digits in a decimal string, counted rather than parsed.
export function fractionDigits(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

// Whether a keystroke may land in the amount field. Anything else is dropped,
// so the field never shows a value the ticket cannot execute.
export function acceptsAmountInput(next: string, decimals: number): boolean {
  if (next.length > MAX_AMOUNT_LENGTH) return false;
  if (!DECIMAL_INPUT.test(next)) return false;
  return fractionDigits(next) <= decimals;
}

// The single verdict on an entered amount. Both the card (which marks the
// field) and the actions (which disable and explain) read it, so they cannot
// disagree about whether an amount is spendable.
export function amountStatus(
  amount: string,
  balanceBaseUnits: bigint,
  decimals: number
): AmountStatus {
  const trimmed = amount.trim();
  if (!trimmed || trimmed === ".") return "empty";
  if (trimmed.length > MAX_AMOUNT_LENGTH || !DECIMAL_INPUT.test(trimmed)) return "invalid";
  // Truncating the extra digits instead would let 1240.0000001 read as exactly
  // a 1240 balance and pass the balance check.
  if (fractionDigits(trimmed) > decimals) return "too-precise";
  const entered = toBaseUnits(trimmed, decimals);
  if (entered === 0n) return "empty";
  if (entered > balanceBaseUnits) return "above-balance";
  return "ok";
}

// Group the whole part of a decimal string in threes and cut the fraction to
// `maxFractionDigits`. The cut truncates rather than rounds: a rounded-up
// balance would offer to spend money that is not there.
export function formatDecimalString(value: string, maxFractionDigits: number): string {
  const [whole = "0", frac = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const kept = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return kept ? `${grouped}.${kept}` : grouped;
}
