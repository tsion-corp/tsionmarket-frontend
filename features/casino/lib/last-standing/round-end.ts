// When the client may declare a round over on its own clock.
//
// The server's confirmation can be ~10s behind, which is dead air at 00:00, so
// the arena runs the round-end sequence off its own countdown. That prediction
// is right almost always and catastrophic when it is wrong: it shows a winner
// card for a round that is still running.

export interface RoundEndInputs {
  /** The server still reports the game as taking wagers. */
  gameActive: boolean;
  /** Seconds left on the client's own clock. */
  countdown: number;
  /** A round-end sequence is already running or finished for this round. */
  alreadyEnding: boolean;
  /** The socket is behind, so this client's view is not evidence of anything. */
  degraded: boolean;
  /** THIS client has a wager that has not resolved yet. */
  ownWagerPending: boolean;
}

/**
 * Whether the local clock reaching zero should start the round-end sequence.
 *
 * The last condition is the one that was missing. A wager placed at five
 * seconds was still confirming when the clock hit zero, so the arena declared
 * the player the winner — then the wager landed, the pot doubled and the round
 * carried on (reported 2026-09-22). Our own unresolved wager is the strongest
 * evidence there is that the round is about to continue, so zero means nothing
 * while one is outstanding.
 */
export function shouldBeginRoundEnd({
  gameActive,
  countdown,
  alreadyEnding,
  degraded,
  ownWagerPending,
}: RoundEndInputs): boolean {
  if (!gameActive) return false;
  if (countdown > 0) return false;
  if (alreadyEnding) return false;
  if (degraded) return false;
  if (ownWagerPending) return false;
  return true;
}
