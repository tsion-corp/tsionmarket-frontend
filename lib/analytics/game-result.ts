import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

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

export interface ComputerGameWager {
  stakeUsdc: string;
  houseExposureUsdc: string;
  potentialPayoutUsdc: string;
  payoutUsdc: string;
  feeBps: number;
}

function usdcNumber(units: bigint): number {
  return Number(fromBaseUnits(units, 6));
}

// A computer wager is not an equal two-player pot. The server funds a reward
// scaled by engine level, and only that reward is charged the platform fee.
export function computerGamePayout(
  wager: ComputerGameWager,
  outcome: "win" | "loss" | "draw"
): GamePayout {
  const stake = toBaseUnits(wager.stakeUsdc, 6);
  if (stake <= 0n) return { stake_usd: 0, payout_usd: 0, fee_usd: 0 };

  if (outcome === "draw") {
    return { stake_usd: usdcNumber(stake), payout_usd: usdcNumber(stake), fee_usd: 0 };
  }
  if (outcome === "loss") {
    return { stake_usd: usdcNumber(stake), payout_usd: 0, fee_usd: 0 };
  }

  const exposure = toBaseUnits(wager.houseExposureUsdc, 6);
  const fee = (exposure * BigInt(Math.max(0, Math.round(wager.feeBps)))) / 10_000n;
  const settledPayout = toBaseUnits(wager.payoutUsdc, 6);
  const quotedPayout = toBaseUnits(wager.potentialPayoutUsdc, 6);
  const payout = settledPayout > 0n ? settledPayout : quotedPayout;

  return {
    stake_usd: usdcNumber(stake),
    payout_usd: usdcNumber(payout),
    fee_usd: usdcNumber(fee),
  };
}
