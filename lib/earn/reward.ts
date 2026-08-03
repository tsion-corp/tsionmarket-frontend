// Reward amounts. The earn API sends and receives them as JSON numbers, but a
// number is not safe to add up: a three-way split of 1000.10 USDC drifts in the
// low digits, and this is a payout figure a sponsor commits to. So a reward is
// an integer count of the token's smallest unit everywhere inside the app, and
// only becomes a number again in the payload builder.

import { formatUnits, parseUnits } from "viem";
import type { RewardAmount, RewardTier } from "@/lib/earn/api/types";

// The tokens listings are denominated in. Anything unlisted falls back to six
// places, which is what every stablecoin on the platform uses, rather than
// guessing eighteen and inflating the amount by a factor of a trillion.
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  ETH: 18,
  WETH: 18,
  SOL: 9,
};

const FALLBACK_DECIMALS = 6;

const DECIMAL_INPUT = /^\d*\.?\d*$/;

export function decimalsFor(token: string): number {
  return TOKEN_DECIMALS[token.toUpperCase()] ?? FALLBACK_DECIMALS;
}

// Parses what a sponsor typed into minor units. Throws on anything that is not
// a clean decimal, so a malformed figure never reaches the service as a reward
// somebody is owed.
export function parseRewardInput(value: string, token: string): bigint {
  const cleaned = value.trim();
  if (cleaned === "" || cleaned === "." || !DECIMAL_INPUT.test(cleaned)) {
    throw new Error("Enter a valid amount.");
  }
  const decimals = decimalsFor(token);
  const [, fraction = ""] = cleaned.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${token.toUpperCase()} has at most ${decimals} decimal places.`);
  }
  return parseUnits(cleaned, decimals);
}

export function rewardFrom(minor: bigint, token: string): RewardAmount {
  return { minor: minor.toString(), token: token.toUpperCase(), decimals: decimalsFor(token) };
}

// Converts the number the API sent into an exact minor-unit amount. A value
// that is not a finite number becomes null rather than zero: a listing with an
// unreadable reward must not render as "free".
export function rewardFromApi(amount: unknown, token: unknown): RewardAmount | null {
  // The service sends reward amounts as numeric strings (e.g. "1000") on some
  // fields and as numbers on others, so accept both — coerce a non-empty numeric
  // string to a number. A value that still isn't finite becomes null rather than
  // zero: a listing with an unreadable reward must not render as "free".
  const num =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" && amount.trim() !== ""
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(num) || num < 0) return null;
  const symbol = typeof token === "string" && token.length > 0 ? token : "USDC";
  const decimals = decimalsFor(symbol);
  // toFixed pins the value to the token's precision before parsing, so a
  // number that arrived as 1000.0000000000001 does not throw here.
  return rewardFrom(parseUnits(num.toFixed(decimals), decimals), symbol);
}

// The number the API expects back. Called once, at the payload boundary.
export function rewardToApi(reward: RewardAmount): number {
  return Number(formatUnits(BigInt(reward.minor), reward.decimals));
}

export function sumRewards(tiers: RewardTier[]): bigint {
  return tiers.reduce((total, tier) => total + BigInt(tier.amount.minor), 0n);
}

// Display only. Whole amounts lose the decimal tail so a 1000 USDC bounty reads
// as "1,000 USDC" rather than "1,000.000000 USDC".
export function formatReward(reward: RewardAmount): string {
  const units = formatUnits(BigInt(reward.minor), reward.decimals);
  const [whole, fraction] = units.split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  const trimmed = fraction?.replace(/0+$/, "") ?? "";
  return `${trimmed ? `${grouped}.${trimmed}` : grouped} ${reward.token}`;
}
