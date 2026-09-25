import type { LegacyHolding } from "@/lib/migration/types";

/**
 * What the old wallet still holds that the migration could move — decided
 * from the frontend's OWN read of that wallet.
 *
 * The service's `hasLegacyFunds` is not that fact: its probe reads ETH and
 * USDC only, so a wallet holding $1.46 of memecoins reports $0; and it also
 * says "yes" while any ledger re-key is pending, a backend queue the user
 * cannot act on. Seen live, both ways round.
 *
 * Only what can move and is worth a cent counts. A balance on an unsponsored
 * network cannot be moved, and dust below the review's own display floor
 * must not hold a gate shut — a wallet here carried 17 sub-cent tokens, any
 * one of which could revert on transfer forever. The sweep still attempts
 * dust; it just cannot hold the user hostage.
 */
export function legacyWalletMovable(holdings: readonly LegacyHolding[]): LegacyHolding[] {
  // A balance that can move now — value plays no part, so a price outage does
  // not read as "nothing left".
  return holdings.filter((h) => h.settleability.state === "now" && h.amount > 0n);
}

export function legacyWalletHasFunds(holdings: readonly LegacyHolding[]): boolean {
  return legacyWalletMovable(holdings).length > 0;
}

// The re-offer floor for a LINKED account. Below this a holding is dust: the
// review's own display shows it as $0.00, and the sweep may never manage to
// move it (a sub-cent memecoin that reverts on transfer). Such a remnant
// must not keep re-opening "Move to Market 2.0" for an account that has
// already moved.
export const WORTH_MOVING_MIN_USD = 0.01;

/**
 * Whether the old wallet holds money worth bringing a linked account back
 * for: something movable AND worth at least a cent, by the same total the
 * badge shows. No exceptions — if the figure reads $0.00 there is nothing to
 * offer, whatever balances sit behind it. An unpriced token is not "money
 * left", it is the long tail the always-open account-menu entry exists for.
 * Seen live: a linked account re-offered on "$0.00 left -> proven".
 */
export function legacyWalletWorthMoving(holdings: readonly LegacyHolding[]): boolean {
  return legacyWalletUsd(holdings) >= WORTH_MOVING_MIN_USD;
}

/**
 * Display total of what could move. Not shown to the user any more — the
 * upgrade copy carries no figures — but it is what legacyWalletWorthMoving
 * measures against the one-cent floor.
 */
export function legacyWalletUsd(holdings: readonly LegacyHolding[]): number {
  return legacyWalletMovable(holdings).reduce((sum, h) => sum + h.valueUsd, 0);
}
