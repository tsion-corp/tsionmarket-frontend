// Stake amounts are exact on-chain values; their dollar figure is only for
// display. Everything here works on the wei string and never rounds a value
// that settles money.

import { formatUnits, parseUnits } from "viem";
import type { TokenAmount } from "@/lib/casino/api/types";

// The casino settles in the same asset the rest of the platform holds on
// Base, so stakes spend the balance the dashboard already shows.
export const STAKE_DECIMALS = 18;

// Fixed-point scale used when converting a dollar figure into wei. Six places
// keeps sub-cent unit prices exact without overflowing a JS number.
const USD_SCALE = 1_000_000;

export function weiToUnits(wei: string): number {
  return Number(formatUnits(BigInt(wei), STAKE_DECIMALS));
}

// Parses a typed amount in whole units into wei. Throws on anything that is
// not a clean decimal, so a malformed stake never reaches the chain.
export function unitsToWei(value: string): bigint {
  const cleaned = value.trim();
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new Error("Enter a valid amount.");
  }
  return parseUnits(cleaned, STAKE_DECIMALS);
}

// Converts a dollar figure the user typed into wei, using the same unit price
// the portfolio derives. Returns 0n when the price is unknown rather than
// guessing, so callers can block the action instead of staking a wrong amount.
export function usdToWei(usd: number, unitPriceUsd: number): bigint {
  if (!Number.isFinite(usd) || !Number.isFinite(unitPriceUsd) || usd <= 0 || unitPriceUsd <= 0) {
    return 0n;
  }
  // Both figures are scaled to integers before dividing. Doing the division in
  // floating point first leaves dust in the low digits of the wei value (a
  // $100 stake at $2000 came out three wei over), and this amount is what gets
  // escrowed on-chain.
  const scaled = (n: number) => BigInt(Math.round(n * USD_SCALE));
  return (scaled(usd) * 10n ** BigInt(STAKE_DECIMALS)) / scaled(unitPriceUsd);
}

// Dollar value of a TokenAmount, preferring the gateway's own valuation and
// falling back to the platform's unit price when it is absent.
export function amountUsd(amount: TokenAmount | null, unitPriceUsd = 0): number {
  if (!amount) return 0;
  if (amount.usdValue > 0) return amount.usdValue;
  return weiToUnits(amount.wei) * unitPriceUsd;
}

// The platform's 5% participation fee, taken from the pot on settlement.
export const PARTICIPATION_FEE_BPS = 500;

export interface PotBreakdown {
  potWei: bigint;
  feeWei: bigint;
  // What the winner receives.
  payoutWei: bigint;
}

// A two-player pot: both stakes in, fee out. Integer maths throughout, with
// the fee floored so the payout is never short by a rounding error.
export function potBreakdown(stakeWei: bigint): PotBreakdown {
  const potWei = stakeWei * 2n;
  const feeWei = (potWei * BigInt(PARTICIPATION_FEE_BPS)) / 10_000n;
  return { potWei, feeWei, payoutWei: potWei - feeWei };
}
