// A crypto deposit arrives at a Dextopus static address and settles into the
// user's wallet minutes or hours later, usually with the app closed. There is
// no request id to poll and no success handler to hang an event on, so the only
// moment the client can observe is the settled transfer showing up in activity.
//
// This is the pure half of that: given the transfers we can see and the ones
// already reported, it says which are new deposits. The hook that owns the
// stored set is in features/activity.

import type { ActivityItem } from "@/lib/server/activity";

// Dextopus settles every deposit as USDC, so an arriving stablecoin is a
// deposit landing and its token amount is its dollar amount. Anything else
// would need a price lookup to report amount_usd, and a guessed figure on a
// money event is worse than no event.
const SETTLED_SYMBOLS = new Set(["USDC", "USDT"]);

// Enough to cover any plausible run of arrivals between two visits, while
// keeping what we persist bounded.
export const MAX_REMEMBERED = 500;

export interface DepositArrival {
  id: string;
  network: string;
  amountUsd: number;
}

/**
 * The inbound stablecoin transfers in `items` that `seen` does not already
 * cover, newest last.
 *
 * Ordering matters: callers report these in the order returned, so a user who
 * was away for three deposits gets them in the order they happened.
 */
export function newDepositArrivals(items: ActivityItem[], seen: Set<string>): DepositArrival[] {
  return items
    .filter(
      (item) =>
        item.direction === "in" &&
        SETTLED_SYMBOLS.has(item.symbol.toUpperCase()) &&
        item.amount > 0 &&
        !seen.has(item.id)
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((item) => ({ id: item.id, network: item.network, amountUsd: item.amount }));
}

/**
 * The ids to remember after reporting, capped.
 *
 * The cap drops the oldest, which is safe because activity itself is finite and
 * ordered: an id old enough to fall out of this set is old enough to have
 * fallen out of the feed that could re-report it.
 */
export function rememberArrivals(seen: Set<string>, ids: string[]): string[] {
  const next = [...seen, ...ids];
  return next.slice(Math.max(0, next.length - MAX_REMEMBERED));
}
