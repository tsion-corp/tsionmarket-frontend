import type { BetSelection, MarketOdds } from "@/features/casino/lib/api/types";

// Display-only helpers for the spectator betting panel. Settlement is done
// server-side in exact units, so nothing here decides money: these only show a
// bettor the current market before they stake.

// A ballpark return for a stake at the current pool prices. Pari-mutuel odds
// float as more money enters and the house takes a rake on the losing pool, so
// this is an estimate, not the settled figure. Assumes no further bets: the
// staked outcome grows by `stake`, and if it wins the bettor gets their stake
// back plus a pro-rata share of the losing pool net of rake.
export function estimatePariMutuelReturn(
  stake: number,
  odds: MarketOdds,
  selection: BetSelection,
  rake: number
): number {
  if (!(stake > 0)) return 0;
  const pool = Number(odds.outcomes[selection].pool);
  const total = Number(odds.total);
  if (!Number.isFinite(pool) || !Number.isFinite(total)) return 0;
  const losing = Math.max(0, total - pool);
  const poolAfter = pool + stake;
  if (poolAfter <= 0) return 0;
  return stake + (stake / poolAfter) * losing * (1 - rake);
}

// How a winning stake is actually paid, broken into the parts the bettor sees.
// Mirrors the service's `plan_settlement`: the winner's own stake is returned in
// full and is never raked, the rake comes off the losing pool only, and what is
// left of the losing pool is split among the winners pro-rata by stake.
export interface PariMutuelBreakdown {
  // Returned in full if the pick wins; never raked.
  stake: number;
  // This bettor's cut of the losing pool after rake.
  profit: number;
  // The house's cut, taken from the losing pool alone.
  rake: number;
  // stake + profit.
  total: number;
  // A pool with money on only one side cannot pay anyone: the service voids it
  // and refunds every stake in full, with no rake. Worth saying out loud,
  // because it is the difference between "no winnings" and "money lost".
  refundOnly: boolean;
}

export function pariMutuelBreakdown(
  stake: number,
  odds: MarketOdds,
  selection: BetSelection,
  rakeBps: number
): PariMutuelBreakdown {
  const empty = { stake: 0, profit: 0, rake: 0, total: 0, refundOnly: false };
  if (!(stake > 0)) return empty;

  const pool = Number(odds.outcomes[selection].pool);
  const total = Number(odds.total);
  if (!Number.isFinite(pool) || !Number.isFinite(total)) return empty;

  // Everything not on this outcome is what the winners are paid from. The
  // bettor's own stake joins the winning side, so it never counts as losing.
  const losing = Math.max(0, total - pool);
  const poolAfter = pool + stake;

  // No money on the other side means nothing to win: the service voids the
  // market and every stake comes back untouched.
  if (losing <= 0 || poolAfter <= 0) {
    return { stake, profit: 0, rake: 0, total: stake, refundOnly: true };
  }

  const rake = losing * (rakeBps / 10_000);
  const share = stake / poolAfter;
  const profit = share * (losing - rake);
  return { stake, profit, rake: share * rake, total: stake + profit, refundOnly: false };
}

// Market-implied probability of an outcome, as a 0..100 share of the total pool.
export function impliedProbability(odds: MarketOdds, selection: BetSelection): number {
  const total = Number(odds.total);
  const pool = Number(odds.outcomes[selection].pool);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(pool)) return 0;
  return Math.max(0, Math.min(100, (pool / total) * 100));
}
