// What a settled staked match paid, from the player's side.
//
// Both seats lock the same stake, so the pot is twice it. A decisive result
// pays the winner the pot less the platform's cut; a draw or an abort refunds
// each side its own stake and takes no cut. The loser is paid nothing, and the
// fee comes out of the winnings rather than off the loser separately, so it is
// only ever reported against the seat that collected.
//
// Kept here rather than in a screen so chess and draughts cannot end up
// reporting the same match differently.

export interface GamePayout {
  stake_usd: number;
  payout_usd: number;
  fee_usd: number;
}

export function gamePayout(
  stakeUsdc: string | null | undefined,
  outcome: "win" | "loss" | "draw",
  feeBps: number
): GamePayout {
  const stake = Number(stakeUsdc ?? 0);
  // An unstaked game settles for nothing on every side.
  if (!Number.isFinite(stake) || stake <= 0) {
    return { stake_usd: 0, payout_usd: 0, fee_usd: 0 };
  }

  if (outcome === "draw") {
    // Refunded in full: the player gets their own stake back, untouched.
    return { stake_usd: stake, payout_usd: stake, fee_usd: 0 };
  }
  if (outcome === "loss") {
    return { stake_usd: stake, payout_usd: 0, fee_usd: 0 };
  }

  const pot = stake * 2;
  const fee = pot * (feeBps / 10_000);
  return { stake_usd: stake, payout_usd: pot - fee, fee_usd: fee };
}
