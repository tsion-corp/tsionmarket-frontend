import type { VaultActivity } from "@/features/casino/lib/vault-api";

// How many rounds the game being watched has run.
//
// A round belongs to one game and counts its stakes: opening the game is
// round 1, and every player who puts money in after that adds one. It climbs
// while the game is alive, and the player who staked last when the clock runs
// out is the Last Man.
//
// It is NOT the game's id. The stage used to print `gameId` in this slot, so
// game 253 announced "Rounds #253" while it was still on its first round.

/**
 * The stakes placed in the run of this game that is being played now, or null
 * when the feed cannot answer.
 *
 * Takes one game's own activity rows (`/games/:id/activities`), in any order.
 *
 * Null is a real answer and the caller must handle it: the round number is
 * read as fact, and printing "Rounds #1" on a game already on its ninth is
 * worse than printing nothing. It means the feed has not arrived yet, or the
 * opening stake is missing from it.
 */
export function currentRoundCount(activities: readonly VaultActivity[]): number | null {
  const run = currentRunActivities(activities);
  if (run === null) return null;
  // The opening stake is round 1; each stake after it adds one. A "won" row is
  // the result of the last round, not a round of its own.
  let rounds = 1;
  for (const row of run.slice(1)) {
    if (row.action === "joined") rounds += 1;
  }
  return rounds;
}

/**
 * The rows belonging to the run of this game that is being played now, oldest
 * first, starting with its opening stake. Null when there is no opening stake
 * in the feed.
 *
 * The vault reuses a game id when the contract is redeployed, so one id's feed
 * can hold more than one finished game: 253 carries a started/won pair from 30
 * August and another from 25 September. The run being played is the one that
 * began at the LAST start, and every row before it belongs to a game that is
 * already over, so the table of plays must not show them either.
 */
export function currentRunActivities(activities: readonly VaultActivity[]): VaultActivity[] | null {
  const ordered = [...activities].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const opened = ordered.findLastIndex((row) => row.action === "started");
  if (opened === -1) return null;
  return ordered.slice(opened);
}
