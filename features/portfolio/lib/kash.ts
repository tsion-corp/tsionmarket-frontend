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
  /**
   * Points economics, straight from the engine.
   *
   * `tierBoundsUsd` are the VOLUME band edges and `tierRatesPer10Usd` the rate
   * inside each band — one more rate than bounds, the last being open-ended.
   * Both are config; restating them in the UI would let the two drift.
   */
  points: {
    pointValueUsd: number;
    /**
     * Revenue share per subscription tier, in whole percent.
     *
     * Replaced `tierBoundsUsd` / `tierRatesPer10Usd` when the engine moved to
     * the points-first model: there are no volume brackets any more, and a
     * tier now earns a share of the fees it generates rather than a rate per
     * $10 traded.
     */
    tierRevenueSharePct?: number[];
  };
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
  /** Null when tiers are owned outright — there is nothing to expire. */
  expiresAt: string | null;
  active: boolean;
  periodDays: number;
  /** True when a tier is bought once and kept, rather than rented. */
  lifetime: boolean;
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
  feePct: number;
  /** Fee in dollars, priced by the engine — never re-derived on the client. */
  feeUsd: string;
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
  kind:
    | "points"
    | "settlement"
    | "purchase"
    | "conversion"
    | "locked-activity"
    | "transfer-in"
    | "transfer-out";
  ref?: string;
  kashPriceUsd?: string;
  notionalUsd?: string;
  feeUsd?: string;
  points?: string;
  activityType?: string;
  txHash?: string;
  /** The other wallet in a transfer-in/transfer-out row. Unset otherwise. */
  counterparty?: string;
  createdAt: string;
}

/**
 * The exact message the wallet must sign to claim. Mirrors
 * WalletSignatureVerifier.claimSettlementMessage() on the backend
 * byte-for-byte — the server recovers the signer over this same string, so
 * drifting the format here is an auth failure, not a lint issue.
 */
export const claimSettlementMessage = (wallet: string, timestamp: number) =>
  [
    "World Street — claim Kash settlement",
    `wallet: ${wallet.toLowerCase()}`,
    `ts: ${timestamp}`,
  ].join("\n");

/**
 * Settle this wallet's accrued points into KSH now, instead of waiting for the
 * weekly batch. Only ever affects the caller's own wallet.
 *
 * No on-chain event proves who is claiming (unlike a purchase or a
 * conversion's permit), so the wallet signs `claimSettlementMessage` and the
 * backend recovers the signer before settling — otherwise anyone could name
 * an arbitrary wallet in the body and force its claim.
 */
export const postKashClaim = (wallet: string, signature: string, timestamp: number) =>
  kash.post<KashClaim>("/settlements/claim", { wallet, signature, timestamp });

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

export const postKashPurchase = (wallet: string, usdcAmount: string, paymentTxHash?: string) =>
  kash.post<KashPurchase>("/purchases", { wallet, usdcAmount, paymentTxHash });

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

/**
 * Compact label for a preset chip — `1000` reads as `1K`.
 *
 * Only the LABEL is abbreviated. The chip still sets the exact decimal string,
 * because an abbreviated value reaching the input would reach the transfer.
 */
export function compactAmountLabel(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  if (value >= 1_000_000) return `${trimZeros(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimZeros(value / 1_000)}K`;
  return formatKashAmount(amount);
}

function trimZeros(value: number): string {
  // 1.0K reads worse than 1K; 1.5K is worth keeping.
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

/** One subscription tier and the revenue share it earns. */
export interface RevenueShareTier {
  /** 1-based, matching the engine's tier numbering. */
  tier: number;
  /** Share of generated fees this tier earns, in whole percent. */
  sharePct: number;
}

/**
 * What each subscription tier earns, as published by the engine.
 *
 * A tier takes a share of the fees its holder generates; upgrading raises that
 * share. This replaced the old volume ladder — bounds and per-$10 rates — when
 * the engine moved to the points-first model, and reading it from the engine
 * rather than restating it here is what stops the modal quoting a number that
 * is not what pays out.
 *
 * EMPTY rather than a guess whenever the field is absent or not an array. The
 * previous version destructured it and called `.map`, so the day the engine
 * renamed it the whole portfolio page died with
 * `Cannot read properties of undefined (reading 'map')`. A ladder nobody can
 * read is a missing row; it is not a broken dashboard.
 */
export function revenueShareTiers(points: KashStatus["points"] | undefined): RevenueShareTier[] {
  const shares = points?.tierRevenueSharePct;
  if (!Array.isArray(shares)) return [];
  return shares.flatMap((sharePct, index) =>
    typeof sharePct === "number" && Number.isFinite(sharePct) ? [{ tier: index + 1, sharePct }] : []
  );
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

// Buying KSH and buying a tier both send USDC on Base. `readyToSpendUsd` is the
// wrong measure for that: it sums every stablecoin on every network, so a
// wallet holding USDT on Solana looks funded for a transfer that will revert.
const BASE_NETWORK = "base-mainnet";
const USDC_SYMBOL = "USDC";

/**
 * Exactly what the wallet can spend on Base, in USDC micro-units.
 *
 * Uses `rawBalance` — the precise on-chain integer — rather than the display
 * float, so a "spend it all" comparison cannot round above what is really
 * there and send a transfer that reverts for a fraction of a cent.
 *
 * Null when the portfolio has not loaded: a missing balance is unknown, not
 * zero, and blocking the button on it would strand a funded user behind a
 * slow request.
 */
export function spendableUsdcMicro(
  tokens: { network: string; symbol: string; rawBalance: string; decimals: number }[] | undefined
): bigint | null {
  if (!tokens) return null;
  const usdc = tokens.find((t) => t.network === BASE_NETWORK && t.symbol === USDC_SYMBOL);
  if (!usdc) return 0n; // Loaded, and there is no USDC on Base in it.
  try {
    // Normalise to 6dp rather than assuming: the same symbol carries different
    // decimals across chains, and a wrong assumption here is a 10^12 error.
    const raw = BigInt(usdc.rawBalance);
    if (usdc.decimals === 6) return raw;
    return usdc.decimals > 6
      ? raw / 10n ** BigInt(usdc.decimals - 6)
      : raw * 10n ** BigInt(6 - usdc.decimals);
  } catch {
    return null;
  }
}

/**
 * USDC micro-units as a plain dollar string, rounded DOWN to cents.
 *
 * Down, never nearest: this figure is shown as "you have $X", and rounding
 * $4.999 up to $5.00 invites the user to spend five dollars they do not have
 * and land on the revert this whole check exists to prevent.
 */
export function formatUsdMicro(micro: bigint): string {
  const cents = micro / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/** A decimal USD string as micro-units, or null when it is not a valid amount. */
export function usdToMicro(amount: string): bigint | null {
  if (!isValidKashAmount(amount)) return null;
  const [whole, fraction = ""] = amount.trim().split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
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
