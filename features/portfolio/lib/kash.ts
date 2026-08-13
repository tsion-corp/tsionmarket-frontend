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
  /** Points economics — `pointValueUsd` is what one point settles into. */
  points: { pointValueUsd: number };
  subscriptions: { periodDays: number; tiers: { tier: number; priceUsd: number }[] };
  desk: {
    purchaseMinUsdc: number;
    purchaseMaxUsdc: number;
    redemptionDiscountPct: number;
    minConvertUsd: number;
  };
  coverage: { state: "normal" | "throttled" | "paused" };
  chainMode: "mock" | "ethers" | "off";
  // Present only in ethers mode: what a conversion's permit signature targets,
  // and — for a purchase — where the buyer's USDC has to be sent.
  chain?: {
    chainId: number;
    tokenAddress: string;
    controllerAddress: string;
    /**
     * Destination for the USDC payment leg. The engine verifies the transfer
     * came `from` the buying wallet, so the payment cannot be made on the
     * user's behalf and this address must be known client-side.
     */
    paymentAddress?: string;
    usdcAddress?: string;
  };
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
  /**
   * The open week. `points` is the cumulative XP total and does not fall when
   * points are claimed; `unclaimed` is what a claim would actually convert, so
   * any "claim now" control must read that one.
   */
  week: { weekKey: string; points: string; unclaimed: string; settlesAt: string };
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

/** Result of settling a wallet's points into KSH. */
export interface KashClaim {
  weekKey: string;
  priceUsd: string;
  wallets: number;
  kashMinted: string;
  failed: number;
  skipped?: string;
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

/**
 * Settle this wallet's accrued points into KSH now, instead of waiting for the
 * weekly batch. Only ever affects the caller's own wallet.
 */
export const postKashClaim = (wallet: string) =>
  kash.post<KashClaim>("/settlements/claim", { wallet });

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

// `idempotencyKey` is not optional in practice, only in the type: a conversion
// is three sequential Base transactions (permit, burn, payout) measuring ~7s
// against the gateway's 10s proxy timeout. A caller can therefore receive a
// timeout for a conversion that ALREADY burned and ALREADY paid, and a retry
// without a key burns a second time. Same key ⇒ the engine returns the
// original conversion instead.
export const postKashConversion = (
  wallet: string,
  kashAmount: string,
  permit?: { deadline: number; v: number; r: string; s: string },
  idempotencyKey?: string
) => kash.post<KashConversion>("/conversions", { wallet, kashAmount, permit, idempotencyKey });

/**
 * A retry key for one conversion ATTEMPT.
 *
 * Must be generated where the user's intent begins, not inside the request:
 * a key minted per request changes on every retry, which is precisely the
 * behaviour it exists to prevent.
 */
export function newConversionKey(): string {
  return `convert-${globalThis.crypto.randomUUID()}`;
}

// Progress toward the holding gate as a 0..1 fraction, from the account's own
// decimal strings. Used for the progress bar, so it clamps rather than throws:
// a malformed value renders an empty bar, not a crash in the balance card.
/**
 * KSH a points balance would settle into, at the current price.
 *
 * Mirrors what the engine does at settlement: points carry a fixed USD value,
 * and that USD buys KSH at the live price. Showing the points figure on a
 * button labelled in KASH would promise a number the claim does not deliver,
 * so this is derived rather than assumed 1:1 — they are only equal while
 * pointValueUsd and the price happen to match.
 *
 * Returns null when either input is missing or unusable, so the caller can
 * fall back rather than render "NaN KASH".
 */
export function pointsToKash(
  points: string,
  pointValueUsd: number | undefined,
  kashPriceUsd: string | undefined
): string | null {
  const pts = Number(points);
  const price = Number(kashPriceUsd);
  if (!Number.isFinite(pts) || pts <= 0) return null;
  if (!pointValueUsd || !Number.isFinite(price) || price <= 0) return null;
  return formatKashAmount(String((pts * pointValueUsd) / price));
}

/**
 * A KSH amount for display: thousands separators, and no more precision than a
 * reader can use. Balances run to five or six figures, and an unseparated
 * 1994000 is unreadable at a glance.
 */
export function formatKashAmount(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  // Whole tokens above 1,000 — decimals there are noise. Below it, keep two.
  const decimals = value >= 1000 || Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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
