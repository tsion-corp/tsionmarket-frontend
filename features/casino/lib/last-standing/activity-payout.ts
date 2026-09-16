import type { TokenAmount, VaultActivity, VaultWinner } from "@/features/casino/lib/vault-api";

// What a `won` row in the activity feed should actually show.
//
// The service reports a win's `amountWei` as the WINNER'S SHARE ALONE, by its
// own contract. That is faithful to the event but reads wrong beside the rest
// of the screen when the winner also started the game: the contract pays the
// winner's half and the starter's tenth to the same wallet in one settle(), so
// the feed said $0.19 while the banner and the Hall of Winners both said $0.23
// for the same payout (game 4, 2026-09-15).
//
// Self-started wins are the common case here, since most games are opened and
// won by whoever was first in. So a `won` row shows what the wallet received,
// and only then: a win by someone who did not start the game is already the
// winner's share and is left exactly as the service reported it.

/**
 * The settlement row for `activity`, when the feeds hold one.
 *
 * Matched on gameId alone. The activity feed and the winners feed are both
 * scoped to one contract by the service, so an id is unambiguous within them.
 */
function settlementFor(
  activity: VaultActivity,
  winners: readonly VaultWinner[]
): VaultWinner | null {
  return winners.find((winner) => winner.gameId === activity.gameId) ?? null;
}

/** True when one wallet both opened and won the game. */
export function isSelfStartedWin(winner: VaultWinner): boolean {
  return winner.winner.toLowerCase() === winner.starter.toLowerCase();
}

/**
 * The amount an activity row should render.
 *
 * Every row but a self-started win is the service's own figure, untouched.
 */
export function activityAmount(
  activity: VaultActivity,
  winners: readonly VaultWinner[]
): Pick<TokenAmount, "amount" | "raw" | "decimals"> {
  // The service reports an activity amount as raw base units, with no scale of
  // its own; the caller reads the scale from the game.
  const fallback = { amount: activity.amountWei, raw: activity.amountWei, decimals: undefined };
  if (activity.action !== "won") return fallback;

  const settlement = settlementFor(activity, winners);
  if (!settlement || !isSelfStartedWin(settlement)) return fallback;

  // paidToWinner is the winner's share plus the starter's; a row from before
  // that field existed has only toWinner, which is what we would have shown.
  return settlement.paidToWinner ?? settlement.toWinner ?? fallback;
}
