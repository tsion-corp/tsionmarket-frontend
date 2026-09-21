import type { TokenBalance } from "@/lib/server/alchemy";

/**
 * A cent: the smallest figure the app will print. A holding under it can only
 * be shown as "<$0.01".
 */
export const DUST_USD = 0.01;

/** True for a real balance nobody could price: value unknown, not zero. */
export function isUnpricedHolding(token: TokenBalance): boolean {
  return token.balance > 0 && token.priceUsd === 0;
}

/**
 * True for a holding worth so little it cannot be shown as a figure.
 *
 * Anyone can mint a token and send it to any address, and people do, in their
 * thousands. Those arrivals are worth a fraction of a cent each and the owner
 * never asked for them, so counting them made a new wallet's balance read
 * "<$0.01" when the honest answer was "$0.00".
 *
 * An unpriced holding is not dust: valueUsd is balance x price, so a balance we
 * could not price is $0 through no fault of the owner, and hiding it would tell
 * them they do not have something they do.
 */
export function isDustHolding(token: TokenBalance): boolean {
  if (isUnpricedHolding(token)) return false;
  return token.valueUsd > 0 && token.valueUsd < DUST_USD;
}

/**
 * What the balance is worth, dust excluded.
 *
 * The figure on the balance card, so it is the sum of what the app is willing
 * to show as a number. A wallet holding nothing but unsolicited dust totals
 * exactly zero here, and reads "$0.00".
 */
export function visibleTotalUsd(tokens: readonly TokenBalance[]): number {
  return tokens.reduce(
    (total, token) => (isDustHolding(token) ? total : total + token.valueUsd),
    0
  );
}
