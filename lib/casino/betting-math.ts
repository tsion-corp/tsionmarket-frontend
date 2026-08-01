import type { BetSelection, MarketOdds } from "@/lib/casino/api/types";

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

// Market-implied probability of an outcome, as a 0..100 share of the total pool.
export function impliedProbability(odds: MarketOdds, selection: BetSelection): number {
  const total = Number(odds.total);
  const pool = Number(odds.outcomes[selection].pool);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(pool)) return 0;
  return Math.max(0, Math.min(100, (pool / total) * 100));
}
