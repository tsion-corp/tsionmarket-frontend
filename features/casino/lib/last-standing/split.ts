// How a Last Man pot is divided, and what the winner is actually paid.
//
// The contract splits a settled pot three ways: the last player standing, the
// treasury, and whoever opened the game. The winner and the starter are often
// the same wallet (every game so far), and then that wallet is paid both
// shares. Everything that shows a winner an amount reads it from here, so the
// reveal, the banner, the Hall of Winners and the activity feed cannot tell
// three different stories about one payout.
//
// The basis points are the contract's current values and are only a fallback
// for the live estimate before settlement; the contract's previewSplit and
// GameSettled carry the exact wei, and the section reads the live bps too,
// because the owner can change them.

export interface SplitBps {
  winner: number;
  starter: number;
}

/** The contract's split at deployment: 50% winner, 10% starter, 40% treasury. */
export const DEFAULT_SPLIT_BPS: SplitBps = { winner: 5000, starter: 1000 };

export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** What the winner is paid, in wei: their share, plus the starter's if they opened the game. */
export function winnerPayoutWei(
  toWinner: bigint,
  toStarter: bigint,
  winner: string,
  starter: string
): bigint {
  return isSameAddress(winner, starter) ? toWinner + toStarter : toWinner;
}

/** The winner's share of a pot before settlement, in the pot's own unit. */
export function estimateWinnerPayout(
  pot: number,
  winnerIsStarter: boolean,
  bps: SplitBps = DEFAULT_SPLIT_BPS
): number {
  const share = bps.winner + (winnerIsStarter ? bps.starter : 0);
  return (pot * share) / 10_000;
}
