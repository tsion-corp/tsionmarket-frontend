"use client";

// Transport and domain types for the Kash rewards engine. Everything goes
// through our same-origin proxy at app/api/kash, which holds the session gate.
//
// The model (points-first weekly settlement): activity earns POINTS live, like
// XP; every Saturday 00:00 UTC the week's points convert to KSH once, at the
// settlement price, and mint to the wallet. Points and balance are separate
// numbers and must never be conflated in the UI. There is no vesting lock:
// convertible always equals balance.
//
// Every amount on this wire is a decimal string with at most 6 decimal places,
// never a number: the engine rejects JSON numbers, and floats cannot carry
// money. Keep amounts as strings end to end and only parse for display math.

import { createServiceClient } from "@/lib/api/service";

const kash = createServiceClient("/api/kash", "Kash is unavailable right now.");

export interface KashStatus {
  price: { kashPriceUsd: string; source: string };
  treasury: { usdcMode: "mock" | "ethers" };
  supply: { maxSupply: string; circulating: string };
  // The gate is a dollar value of KSH, not a token count, so it holds as the
  // price moves.
  gate: { minHoldingUsd: number };
  subscriptions: { periodDays: number; tiers: { tier: number; priceUsd: number }[] };
  desk: {
    purchaseMinUsdc: number;
    purchaseMaxUsdc: number;
    redemptionDiscountPct: number;
    minConvertUsd: number;
  };
  coverage: { state: "normal" | "throttled" | "paused" };
  chainMode: "mock" | "ethers" | "off";
  // Present only in ethers mode: what a conversion's permit signature targets.
  chain?: { chainId: number; tokenAddress: string; controllerAddress: string };
}

export interface KashSettlement {
  weekKey: string;
  points: string;
  kash: string;
  priceUsd: string;
  status: string;
  txHash?: string;
}

export interface KashAccount {
  wallet: string;
  balance: string;
  balanceUsd: string;
  lifetimeEarned: string;
  purchased: string;
  convertible: string;
  // The open week's live points and when they convert to KSH.
  week: { weekKey: string; points: string; settlesAt: string };
  // Past weekly payouts, newest first.
  settlements: KashSettlement[];
  gate: { minHoldingUsd: string; minHoldingKash: string; met: boolean; shortfall: string };
  kashPriceUsd: string;
}

export interface KashSubscription {
  wallet: string;
  tier: number;
  paidTier: number;
  expiresAt: string | null;
  active: boolean;
  periodDays: number;
}

export interface KashSubscriptionTier {
  tier: number;
  priceUsd: number;
  upgradeFromFreeUsd: number;
}

export interface KashPurchaseQuote {
  usdcAmount: string;
  kashReceived: string;
  kashPriceUsd: string;
  meetsHoldingGate: boolean;
}

export interface KashPurchase {
  id: string;
  wallet: string;
  usdcPaid: string;
  kashReceived: string;
  kashPriceUsd: string;
  createdAt: string;
  mintTxHash?: string;
  paymentTxHash?: string;
}

export interface KashConversionQuote {
  kashAmount: string;
  usdcPayout: string;
  marketPriceUsd: string;
  redemptionPriceUsd: string;
  discountPct: number;
  coverageState: "normal" | "throttled" | "paused";
  epochCapRemainingUsd: string;
}

export interface KashConversion {
  id: string;
  wallet: string;
  kashBurned: string;
  usdcPaid: string;
  redemptionPriceUsd: string;
  createdAt: string;
  burnTxHash?: string;
  payoutTxHash?: string;
}

export interface KashLedgerEntry {
  id: string;
  wallet: string;
  deltaKash: string;
  kind: "points" | "settlement" | "purchase" | "conversion" | "locked-activity";
  ref?: string;
  kashPriceUsd?: string;
  notionalUsd?: string;
  feeUsd?: string;
  points?: string;
  activityType?: string;
  txHash?: string;
  createdAt: string;
}

export const getKashStatus = () => kash.get<KashStatus>("/status");

export const getKashAccount = (wallet: string) =>
  kash.authedGet<KashAccount>(`/accounts/${wallet}`);

export const getKashLedger = (wallet: string, limit = 20) =>
  kash.authedGet<KashLedgerEntry[]>(`/accounts/${wallet}/ledger`, { limit });

export const getKashSubscriptionTiers = () =>
  kash.get<KashSubscriptionTier[]>("/subscriptions/tiers");

export const getKashSubscription = (wallet: string) =>
  kash.authedGet<KashSubscription>(`/subscriptions/${wallet}`);

export const postKashSubscribe = (wallet: string, tier: number, paymentTxHash?: string) =>
  kash.post<KashSubscription>("/subscriptions", { wallet, tier, paymentTxHash });

export const getKashPurchaseQuote = (usdcAmount: string) =>
  kash.get<KashPurchaseQuote>("/purchases/quote", { amount: usdcAmount });

export const getKashConversionQuote = (kashAmount: string) =>
  kash.get<KashConversionQuote>("/conversions/quote", { amount: kashAmount });

export const postKashPurchase = (wallet: string, usdcAmount: string, paymentTxHash?: string) =>
  kash.post<KashPurchase>("/purchases", { wallet, usdcAmount, paymentTxHash });

export const postKashConversion = (
  wallet: string,
  kashAmount: string,
  permit?: { deadline: number; v: number; r: string; s: string }
) => kash.post<KashConversion>("/conversions", { wallet, kashAmount, permit });

// Progress toward the holding gate as a 0..1 fraction, from the account's own
// decimal strings. Used for the progress bar, so it clamps rather than throws:
// a malformed value renders an empty bar, not a crash in the balance card.
export function gateProgress(account: {
  balance: string;
  gate: { minHoldingKash: string };
}): number {
  const balance = Number(account.balance);
  const min = Number(account.gate.minHoldingKash);
  if (!Number.isFinite(balance) || !Number.isFinite(min) || min <= 0) return 0;
  return Math.min(1, Math.max(0, balance / min));
}

// True when the amount string is a positive decimal with at most 6 decimal
// places, the only shape the engine accepts.
export function isValidKashAmount(raw: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(raw.trim()) && Number(raw) > 0;
}

// Time until the week settles, as coarse day/hour buckets for the countdown.
// Null when the timestamp is past or malformed, so the card can fall back to
// "settling soon" instead of a negative countdown.
export function settlesIn(
  nowMs: number,
  settlesAt: string
): { days: number; hours: number } | null {
  const target = Date.parse(settlesAt);
  if (!Number.isFinite(target) || target <= nowMs) return null;
  const totalHours = Math.floor((target - nowMs) / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}
