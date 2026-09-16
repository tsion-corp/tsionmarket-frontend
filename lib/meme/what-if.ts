import { exactDecimal } from "@/lib/meme/momentum";

// The what-if line on a Trending card: what a stake put in one window ago is
// worth now. It is a money figure, so it is worked out on the decimal strings
// with bigint and the same exact reading of a change the momentum tag uses.

export const WHAT_IF_STAKE_USD = "100";

/**
 * stake * (1 + change / 100), rounded half up to cents, never below "0.00".
 * Null when there is no change to apply, or either figure is unreadable, so
 * the line is hidden rather than shown as $0.
 */
export function whatIfValue(stakeUsd: string, changePercent: string | null): string | null {
  const stake = exactDecimal(stakeUsd);
  const change = exactDecimal(changePercent);
  if (stake === null || change === null || stake.units < 0n) return null;

  // stake.units / 10^s * (100 * 10^c + change.units) / 10^c / 100, in cents.
  const numerator = stake.units * (100n * 10n ** BigInt(change.scale) + change.units) * 100n;
  const denominator = 10n ** BigInt(stake.scale + change.scale + 2);
  if (numerator <= 0n) return "0.00";

  const cents = (numerator * 2n + denominator) / (denominator * 2n);
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
