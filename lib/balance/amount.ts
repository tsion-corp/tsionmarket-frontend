import { fromBaseUnits } from "@/lib/trade/math";
import { formatQuantity } from "@/lib/meme/decimal";
import type { TokenAmount } from "@/lib/balance/types";

// Everything this app is allowed to do with a balance from the user-management
// service, which is: turn it into a bigint, turn it into a decimal string,
// compare two of them, and render one. No other module calls BigInt() or
// Number() on a balance.
//
// WHY THIS FILE EXISTS, AND WHY HERE
//
// Two conventions already cover the pieces:
//
//   lib/trade/math.ts   base units <-> decimal string, exactly, via bigint
//                       (toBaseUnits / fromBaseUnits).
//   lib/meme/decimal.ts arithmetic and formatting on decimal strings, on a
//                       bigint scaled to 18 places, never producing a float
//                       and never turning a null into a zero.
//
// What neither has is this endpoint's wire shape: base units and their
// `decimals` arriving together as one object, which is the pairing every
// function below takes. So this is a bridge rather than a third convention —
// it composes the two above and adds no arithmetic of its own, and it sits
// beside the type it interprets. If a second service ever sends the same
// (baseUnits, decimals) pair, these belong in lib/trade/math with it.

/**
 * The amount as an exact bigint count of base units.
 *
 * Throws on a string that is not an integer, which cannot happen to a parsed
 * UserBalance: lib/balance/schema.ts admits only /^\d+$/. It throws rather
 * than returning 0n because a balance we cannot read is not a balance of zero,
 * and a zero here would be shown to someone as their money.
 */
export function baseUnitsOf(amount: TokenAmount): bigint {
  return BigInt(amount.baseUnits);
}

/**
 * The amount as a plain decimal string — "0.000504709067444182" — which is
 * what lib/meme/decimal.ts's formatters take. Exact at any size: the
 * conversion is string surgery on a bigint, so no digit is lost on the way.
 */
export function toDecimalString(amount: TokenAmount): string {
  return fromBaseUnits(baseUnitsOf(amount), amount.decimals);
}

/**
 * -1, 0 or 1 for `a` against `b`, exactly, even when the two are scaled
 * differently (6-decimal USDC against 18-decimal ETH).
 *
 * Both sides are scaled UP to the finer of the two decimals. Scaling up only
 * multiplies, so neither side is ever truncated into a tie it did not earn —
 * the reason this does not simply compare the 18-place figures lib/meme/decimal
 * works in.
 */
export function compareAmounts(a: TokenAmount, b: TokenAmount): -1 | 0 | 1 {
  const scale = Math.max(a.decimals, b.decimals);
  const left = baseUnitsOf(a) * 10n ** BigInt(scale - a.decimals);
  const right = baseUnitsOf(b) * 10n ** BigInt(scale - b.decimals);
  return left > right ? 1 : left < right ? -1 : 0;
}

/**
 * Several amounts added into one, exactly, whatever scales they arrive at.
 *
 * The result carries the FINEST scale of its inputs, and every input is scaled
 * up to it before the addition — the same direction compareAmounts scales, and
 * for the same reason: scaling up only multiplies, so no addend is truncated
 * on the way in and a sub-cent holding cannot vanish into a large one. Adding
 * 6-decimal USDC to an 18-decimal stable is the case this exists for.
 *
 * An empty list sums to a literal zero rather than to null. That is a claim
 * about the addends, not about knowledge: "these amounts add to nothing" is
 * true of no amounts. A caller that does not yet KNOW the amounts must not
 * call this with [] — see lib/balance/spendable.ts, which keeps that
 * distinction in its own return type.
 */
export function sumAmounts(amounts: readonly TokenAmount[]): TokenAmount {
  const decimals = amounts.reduce((finest, amount) => Math.max(finest, amount.decimals), 0);
  const total = amounts.reduce(
    (sum, amount) => sum + baseUnitsOf(amount) * 10n ** BigInt(decimals - amount.decimals),
    0n
  );
  return { baseUnits: total.toString(), decimals };
}

/** True for a holding of exactly nothing. */
export function isZeroAmount(amount: TokenAmount): boolean {
  return baseUnitsOf(amount) === 0n;
}

/**
 * The amount as a reader sees it: grouped, four places from one coin up and
 * four significant digits below, so a dust balance is never rounded to "0".
 *
 * This is the display edge and the only place a balance stops being exact.
 * There is no formatUsd counterpart on purpose: this endpoint sends no dollars
 * (see UnpricedUsd), so there is no dollar figure here to format.
 */
export function formatAmount(amount: TokenAmount): string | null {
  return formatQuantity(toDecimalString(amount));
}
