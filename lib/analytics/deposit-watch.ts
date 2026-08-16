// A crypto deposit arrives at a Dextopus static address and settles into the
// user's wallet minutes or hours later, usually with the app closed. There is
// no request id to poll and no success handler to hang an event on, so the only
// moment the client can observe is the settled transfer showing up in activity.
//
// This is the pure half of that: given the transfers we can see and the ones
// already reported, it says which are new deposits. The hook that owns the
// stored set is in features/activity.

import { normalizeHash } from "@/lib/analytics/self-initiated";
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

// An inbound stablecoin transfer worth a dollar figure. Being one of these does
// not make it a deposit: that also depends on whether we caused it.
function isStablecoinArrival(item: ActivityItem): boolean {
  return (
    item.direction === "in" && SETTLED_SYMBOLS.has(item.symbol.toUpperCase()) && item.amount > 0
  );
}

/**
 * Every inbound stablecoin transfer in `items`, whether or not it counts as a
 * deposit.
 *
 * The caller remembers these rather than only the ones it reported, so a
 * transfer ruled out as self-caused stays ruled out. Without that it would be
 * reconsidered on every visit and would eventually be reported as a deposit,
 * once its hash aged out of the self-initiated record.
 */
export function depositCandidateIds(items: ActivityItem[]): string[] {
  return items.filter(isStablecoinArrival).map((item) => item.id);
}

/**
 * The inbound stablecoin transfers in `items` that are genuinely deposits and
 * that `seen` does not already cover, newest last.
 *
 * `selfInitiated` holds the hashes of transactions this app sent or settled.
 * Excluding them is what stops a sale, a conversion, a perp close or a game
 * withdrawal from being counted as money arriving from outside: all of those
 * end as inbound stablecoin, and nothing else about the transfer distinguishes
 * them. Getting this wrong does not just mislabel an event, it marks a user who
 * never funded the account as a depositor, because the profile totals follow
 * `deposit_completed`.
 *
 * Ordering matters: callers report these in the order returned, so a user who
 * was away for three deposits gets them in the order they happened.
 */
export function newDepositArrivals(
  items: ActivityItem[],
  seen: Set<string>,
  selfInitiated: Set<string> = new Set()
): DepositArrival[] {
  return items
    .filter(
      (item) =>
        isStablecoinArrival(item) &&
        !seen.has(item.id) &&
        !selfInitiated.has(normalizeHash(item.hash))
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
