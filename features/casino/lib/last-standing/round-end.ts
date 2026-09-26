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

export interface RoundEndConfirmation {
  /** The service still reports the game as taking wagers. */
  gameActive: boolean;
  /** Seconds left on the client's own clock. */
  countdown: number;
  /** How long the arena has been waiting for the service to answer. */
  waitedMs: number;
  /** How long it is willing to wait before trusting its own clock. */
  maxWaitMs: number;
  /** How long an "inactive" report must hold before it is believed. */
  settleMs: number;
}

/**
 * What to do while waiting for the service to confirm a round actually ended.
 *
 * The suspense used to run off the local clock alone, and backed out later if
 * the round turned out to be running. That reads as the game glitching at the
 * exact moment money is decided, so the confirmation happens FIRST and the
 * winner suspense only ever opens on a round the service agrees has ended.
 *
 * "continued" wins over the deadline: a clock with time on it is positive
 * evidence the round is alive, and a slow answer must never turn that into a
 * winner card.
 *
 * The deadline exists because the service can be seconds behind but not
 * minutes. Waiting forever would freeze the arena at 00:00 with nothing
 * happening, which is the dead air the local-clock prediction existed to
 * avoid in the first place.
 */
export function resolveRoundEndConfirmation({
  gameActive,
  countdown,
  waitedMs,
  maxWaitMs,
  settleMs,
}: RoundEndConfirmation): "wait" | "ended" | "continued" {
  // A clock with time on it is positive evidence the round is alive and beats
  // everything below: no answer, however slow, may turn it into a winner card.
  if (gameActive && countdown > 0) return "continued";
  // An inactive report has to HOLD before it is believed. `active` is derived
  // from endTime, so a wager landing at the buzzer leaves a window where
  // endTime has passed but the extension is not indexed yet. Believing that
  // window is what showed a winner card on a round that then carried on.
  if (!gameActive) return waitedMs >= settleMs ? "ended" : "wait";
  // The local clock is at zero and nothing has contradicted it.
  if (waitedMs >= maxWaitMs) return "ended";
  return "wait";
}
