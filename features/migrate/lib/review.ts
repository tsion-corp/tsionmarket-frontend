// What the review screen shows, derived from discovered holdings: what moves
// on its own, what the user has to opt in to, what waits, what cannot move.
// Pure so the partition is tested.

import { isSettleable, sumValueUsd } from "@/lib/migration/schedule";
import type { LegacyHolding, Settleability, SettleOutcome, Venue } from "@/lib/migration/types";

export interface ReviewGroups {
  automatic: LegacyHolding[];
  optIn: LegacyHolding[];
  later: LegacyHolding[];
  skipped: LegacyHolding[];
  // Value of everything the run would move with the current opt-ins.
  movingUsd: number;
}

export function reviewGroups(
  holdings: readonly LegacyHolding[],
  optIn: ReadonlySet<string>,
  now: number
): ReviewGroups {
  const groups: ReviewGroups = { automatic: [], optIn: [], later: [], skipped: [], movingUsd: 0 };
  for (const h of holdings) {
    if (h.settleability.state === "stranded") groups.skipped.push(h);
    else if (!isSettleable(h, now)) groups.later.push(h);
    else if (h.deterministic) groups.automatic.push(h);
    else groups.optIn.push(h);
  }
  groups.movingUsd =
    sumValueUsd(groups.automatic) + sumValueUsd(groups.optIn.filter((h) => optIn.has(h.id)));
  return groups;
}

/**
 * What still stands between the user and leaving: holdings that could move
 * NOW and that no run so far has settled. Two things deliberately never block:
 *
 *   - skipped (stranded) and later holdings — the user cannot act on them, and
 *     the button this replaced did not hold on them either;
 *   - anything a run settled, whichever run it was. The review's own
 *     `remaining` only subtracts the automatic run, because the opted-in run's
 *     successes are shown in the summary instead; a gate that read that count
 *     would stay shut on money that had just moved, with nothing to retry.
 *
 * Pure, so the gate's exit condition is tested.
 */
export function blockingHoldings(
  holdings: readonly LegacyHolding[],
  runs: ReadonlyArray<{ results: ReadonlyMap<string, SettleOutcome> }>,
  now: number
): LegacyHolding[] {
  const unsettled = holdings.filter((h) => !runs.some((r) => r.results.get(h.id)?.ok));
  const groups = reviewGroups(unsettled, new Set(), now);
  // Below the review's own display floor is not a reason to keep anyone here:
  // a sub-cent token that reverts on transfer would otherwise hold the gate
  // A holding with a balance blocks; one with none does not. Value plays no
  // part, so a price outage cannot make the gate open on a wallet that still
  // holds tokens.
  return [...groups.automatic, ...groups.optIn].filter(worthShowing);
}

// A holding worth less than a cent renders as "$0.00", which is noise: the
// user can neither act on it nor learn anything from it. This hides such a row
// from the list and NEVER from the plan — dust with a real amount is still
// swept, and a row the user is being asked to decide about is still shown
// whatever it is worth.
// The money that must cross before the app lets the user in: native (ETH),
// the stablecoins, and KSH. Everything else — memecoins, spot tokens, perp
// positions, prediction shares — is the long tail, moved later from the
// always-open door in the account menu. A revertible memecoin must never hold
// the app shut.
//
// Polymarket is long tail even though its balance is USDC: it moves through
// a third-party relayer that throttles, and a "Prediction balance" that could
// not be moved because that relayer said "slow down" held the whole upgrade
// and tripped the "this keeps failing" exit. The account menu's door tries it
// again later; the gate does not wait on it.
const CORE_STABLES = new Set(["USDC", "USDT"]);
export function isCoreAsset(holding: LegacyHolding): boolean {
  if (holding.venue === "polymarket") return false;
  return (
    holding.kind === "native" ||
    holding.venue === "kash" ||
    CORE_STABLES.has(holding.symbol.toUpperCase())
  );
}

/** A failure that is the venue asking us to slow down: it waits, it is not a fault. */
export function isThrottled(outcome: SettleOutcome | undefined): boolean {
  return outcome !== undefined && !outcome.ok && outcome.throttled === true;
}

// A holding is worth showing when it has a balance. What is worth MOVING was
// already decided upstream, by the plan's dust floor (DUST_MIN_VALUE_USD):
// anything that reaches here cleared it, so this asks only about the balance
// and never re-applies a value test of its own.
export function worthShowing(holding: LegacyHolding): boolean {
  return holding.amount > 0n;
}

// Opt-ins checked before the user touches anything. Cancelling a resting
// perp order loses nothing, so it starts checked; closing a position or
// selling shares realises a price, so those start unchecked.
export function defaultOptIn(holdings: readonly LegacyHolding[]): Set<string> {
  return new Set(
    holdings
      .filter((h) => !h.deterministic && h.venue === "perps" && h.kind === "order")
      .map((h) => h.id)
  );
}

// The translation key under migrate.reason for a holding that is not moving
// now; null for one that is.
export function reasonKey(s: Settleability): string | null {
  switch (s.state) {
    case "now":
      return null;
    case "waitUntil":
    case "needsBackend":
    case "stranded":
      return s.reason;
    case "pending":
      return "onramp";
  }
}

// Holdings in display order: by venue in the order given, then as discovered.
export function byVenue(
  holdings: readonly LegacyHolding[],
  order: readonly Venue[]
): Array<{ venue: Venue; holdings: LegacyHolding[] }> {
  const groups = new Map<Venue, LegacyHolding[]>();
  for (const h of holdings) {
    const group = groups.get(h.venue);
    if (group) group.push(h);
    else groups.set(h.venue, [h]);
  }
  const rank = (venue: Venue) => {
    const index = order.indexOf(venue);
    return index === -1 ? order.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([venue, list]) => ({ venue, holdings: list }));
}

export const VENUE_ORDER: readonly Venue[] = [
  "wallet",
  "perps",
  "polymarket",
  "cpmm",
  "cashier",
  "vault",
  "kash",
  "earn",
  "onramp",
];
