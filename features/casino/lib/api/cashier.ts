"use client";

// Client for the chess cashier: the backend-custody USDC balance that funds
// staked matches. Deposits are an on-chain USDC send to the cashier's deposit
// address followed by a confirm call; withdrawals and stake locks happen
// entirely server-side against the custodied balance.
//
// All money here travels as decimal strings ("10.5" USDC). Comparisons happen
// in exact base units, never floats.

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import type { GatewayApiError } from "@/lib/api/envelope";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

export const USDC_DECIMALS = 6;
export const COMPUTER_WAGER_FEE_BPS = 800;
export const HUMAN_CHESS_WAGER_FEE_BPS = 1_000;
export const MIN_STAKED_CHESS_COMPUTER_LEVEL = 1;
export const MIN_STAKED_DRAUGHTS_COMPUTER_LEVEL = 4;
export const COMPUTER_DRAW_RETURN_BPS = 0;
export const CHESS_WIN_REWARD_BPS = 10_000;

const COMPUTER_REWARD_BPS: Readonly<Record<number, number>> = {
  4: 2_500,
  5: 4_000,
  6: 6_000,
  7: 8_000,
  8: 10_000,
};

export interface CashierConfig {
  chainId: number;
  tokenSymbol: string;
  tokenAddress: string;
  depositAddress: string;
  requiredConfirmations: number;
  // Platform fee on winnings, in basis points (500 = 5%).
  platformFeeBps: number;
  // Fee charged when moving funds from the chess balance back to the wallet.
  withdrawalFeeBps: number;
  autoPayoutWinnings: boolean;
}

export interface CashierBalance {
  player: string;
  availableUsdc: string;
  lockedUsdc: string;
  lockedMatchUsdc?: string;
  lockedSwissUsdc?: string;
  lockedBetUsdc?: string;
  pendingWithdrawalUsdc?: string;
  lockedOtherUsdc?: string;
  totalUsdc: string;
}

export interface CashierLockBuckets {
  lockedMatchUsdc: string;
  lockedSwissUsdc: string;
  lockedBetUsdc: string;
  pendingWithdrawalUsdc: string;
  lockedOtherUsdc: string;
}

export interface CashierDeposit {
  amountUsdc: string;
  status: string;
}

export interface CashierWithdrawal {
  status: string;
  txHash: string | null;
}

export async function fetchCashierConfig(): Promise<CashierConfig> {
  return chessGet<CashierConfig>("/cashier/config");
}

export async function fetchChessBalance(wallet: string): Promise<CashierBalance> {
  return chessGet<CashierBalance>(
    `/cashier/players/${encodeURIComponent(wallet)}/balance`,
    undefined,
    { requireAuth: true }
  );
}

// Asks the service to credit an on-chain deposit. Idempotent by txHash, so a
// retry after a timeout can never double-credit. The service needs the
// transfer to reach its confirmation depth first, so a call made right after
// the send can fail and succeed moments later.
export async function confirmChessDeposit(wallet: string, txHash: string): Promise<CashierDeposit> {
  return chessPost<CashierDeposit>("/cashier/deposits/confirm", { player: wallet, txHash });
}

export async function createChessWithdrawal(
  wallet: string,
  amountUsdc: string
): Promise<CashierWithdrawal> {
  return chessPost<CashierWithdrawal>("/cashier/withdrawals", { player: wallet, amountUsdc });
}

// True when a cashier failure means "not set up on this deployment" rather
// than a real fault. The service answers CONFLICT while unconfigured, and the
// envelope maps a dead gateway to SERVICE_UNAVAILABLE; either way the cashier
// UI should vanish instead of erroring.
export function isCashierUnavailable(error: unknown): boolean {
  const code = (error as GatewayApiError | null)?.code;
  return code === "CONFLICT" || code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
}

// The proxy now protects private chess reads with the caller's verified
// session, so a 401 or "no wallet on the account" is not a transient fault.
// Retrying or polling those only spams the console and burns rate limits.
export function isCashierAccessDenied(error: unknown): boolean {
  const code = (error as GatewayApiError | null)?.code;
  return code === "UNAUTHORIZED" || code === "NO_WALLET";
}

// Confirmation can race the chain indexer even after the wallet reports a
// successful send. Retry only that narrow state; validation failures must be
// surfaced immediately instead of being mislabeled as pending confirmation.
export function isChessDepositPending(error: unknown): boolean {
  const gatewayError = error as GatewayApiError | null;
  if (!gatewayError) return false;
  const message = gatewayError.message.toLowerCase();
  const pendingMessage =
    message.includes("receipt not found yet") ||
    message.includes("no block number yet") ||
    message.includes("confirmation(s); need");
  return (
    pendingMessage && (gatewayError.code === "CONFLICT" || gatewayError.code === "BAD_REQUEST")
  );
}

function nonNegativeUsdc(value: string | undefined): string {
  if (!value?.trim()) return "0";
  const units = toBaseUnits(value, USDC_DECIMALS);
  return units > 0n ? fromBaseUnits(units, USDC_DECIMALS) : "0";
}

export function cashierLockBuckets(balance: CashierBalance | null | undefined): CashierLockBuckets {
  return {
    lockedMatchUsdc: nonNegativeUsdc(balance?.lockedMatchUsdc),
    lockedSwissUsdc: nonNegativeUsdc(balance?.lockedSwissUsdc),
    lockedBetUsdc: nonNegativeUsdc(balance?.lockedBetUsdc),
    pendingWithdrawalUsdc: nonNegativeUsdc(balance?.pendingWithdrawalUsdc),
    lockedOtherUsdc: nonNegativeUsdc(balance?.lockedOtherUsdc),
  };
}

// The in-play balance is everything still held by the Chess ledger. Derive it
// from the authoritative buckets so an available balance cannot disappear
// because an older response supplied an incorrect total field.
export function cashierTotalUsdc(balance: CashierBalance | null | undefined): string {
  const available = toBaseUnits(balance?.availableUsdc ?? "0", USDC_DECIMALS);
  const locked = toBaseUnits(balance?.lockedUsdc ?? "0", USDC_DECIMALS);
  return fromBaseUnits(available + locked, USDC_DECIMALS);
}

export function hasPositiveUsdc(value: string): boolean {
  return toBaseUnits(value, USDC_DECIMALS) > 0n;
}

// 500 bps reads as 5 (%). Display only; settlement math stays server-side.
export function feePctFromBps(bps: number): number {
  return bps / 100;
}

// The typed amount as exact USDC base units, or null when it is not a
// positive plain decimal. Empty input, zero, and anything with signs or
// separators all come back null.
export function parseUsdcAmount(value: string): bigint | null {
  const cleaned = value.trim();
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const units = toBaseUnits(cleaned, USDC_DECIMALS);
  return units > 0n ? units : null;
}

// Canonical decimal string for a typed amount ("10." -> "10", "05.50" ->
// "5.5"), or null when it is not a positive decimal. This is what goes on the
// wire, so the service never sees a trailing dot or padding.
export function normalizeUsdcAmount(value: string): string | null {
  const units = parseUsdcAmount(value);
  return units === null ? null : fromBaseUnits(units, USDC_DECIMALS);
}

// Whether a typed amount overdraws a decimal-string balance, compared in
// exact base units. An unparseable amount is not "over", it is invalid, and
// the input validation reports that separately.
export function exceedsUsdcBalance(amount: string, balance: string): boolean {
  const units = parseUsdcAmount(amount);
  if (units === null) return false;
  return units > toBaseUnits(balance, USDC_DECIMALS);
}

export interface CashierFundingPlan {
  depositUsdc: string;
  totalAvailableUsdc: string;
  sufficient: boolean;
}

// A wager consumes the existing cashier ledger before asking the wallet for
// more. This prevents every wager from sending a second on-chain deposit and
// leaves the chain involved only when the ledger has a real shortfall.
export function cashierFundingPlan(
  stakeUsdc: string,
  ledgerUsdc: string,
  walletUsdc: string
): CashierFundingPlan | null {
  const stake = parseUsdcAmount(stakeUsdc);
  if (stake === null) return null;
  const ledger = toBaseUnits(ledgerUsdc || "0", USDC_DECIMALS);
  const wallet = toBaseUnits(walletUsdc || "0", USDC_DECIMALS);
  const nonNegativeLedger = ledger > 0n ? ledger : 0n;
  const nonNegativeWallet = wallet > 0n ? wallet : 0n;
  const total = nonNegativeLedger + nonNegativeWallet;
  const shortfall = stake > nonNegativeLedger ? stake - nonNegativeLedger : 0n;
  return {
    depositUsdc: fromBaseUnits(shortfall, USDC_DECIMALS),
    totalAvailableUsdc: fromBaseUnits(total, USDC_DECIMALS),
    sufficient: stake <= total,
  };
}

export interface ComputerWagerBreakdown {
  youLock: string;
  balanceAfter: string;
  houseExposure: string;
  fee: string;
  potentialPayout: string;
  drawPayout: string;
  rewardPercent: number;
  sufficient: boolean;
}

// Computer games return the player's principal untouched and charge the fee
// only against the level-based reward. Keep this separate from the equal-pot
// PvP calculation below so the two settlement models cannot be mixed.
export function computerWagerBreakdown(
  stakeUsdc: string,
  availableUsdc: string,
  level: number,
  feeBps: number = COMPUTER_WAGER_FEE_BPS
): ComputerWagerBreakdown | null {
  const rewardBps = COMPUTER_REWARD_BPS[level];
  if (rewardBps === undefined) return null;

  const stake = toBaseUnits(stakeUsdc, USDC_DECIMALS);
  if (stake <= 0n) return null;

  const houseExposure = (stake * BigInt(rewardBps)) / 10_000n;
  if (houseExposure <= 0n) return null;

  const normalizedFeeBps = BigInt(Math.max(0, Math.min(10_000, Math.round(feeBps))));
  const fee = (houseExposure * normalizedFeeBps) / 10_000n;
  const potentialPayout = stake + houseExposure - fee;
  const drawPayout = (stake * BigInt(COMPUTER_DRAW_RETURN_BPS)) / 10_000n;
  const available = toBaseUnits(availableUsdc, USDC_DECIMALS);
  const sufficient = available >= stake;

  return {
    youLock: fromBaseUnits(stake, USDC_DECIMALS),
    balanceAfter: fromBaseUnits(sufficient ? available - stake : 0n, USDC_DECIMALS),
    houseExposure: fromBaseUnits(houseExposure, USDC_DECIMALS),
    fee: fromBaseUnits(fee, USDC_DECIMALS),
    potentialPayout: fromBaseUnits(potentialPayout, USDC_DECIMALS),
    drawPayout: fromBaseUnits(drawPayout, USDC_DECIMALS),
    rewardPercent: rewardBps / 100,
    sufficient,
  };
}

export function chessComputerWagerBreakdown(
  stakeUsdc: string,
  availableUsdc: string,
  level: number
): ComputerWagerBreakdown | null {
  if (level < 1 || level > 8) return null;
  const stake = toBaseUnits(stakeUsdc, USDC_DECIMALS);
  if (stake <= 0n) return null;
  const reward = (stake * BigInt(CHESS_WIN_REWARD_BPS)) / 10_000n;
  const available = toBaseUnits(availableUsdc, USDC_DECIMALS);
  const sufficient = available >= stake;
  return {
    youLock: fromBaseUnits(stake, USDC_DECIMALS),
    balanceAfter: fromBaseUnits(sufficient ? available - stake : 0n, USDC_DECIMALS),
    houseExposure: fromBaseUnits(reward, USDC_DECIMALS),
    fee: "0",
    potentialPayout: fromBaseUnits(stake + reward, USDC_DECIMALS),
    drawPayout: "0",
    rewardPercent: CHESS_WIN_REWARD_BPS / 100,
    sufficient,
  };
}

// What a stake does to the player's balance and pot, computed the way the
// backend settles it: both sides lock the same stake, the winner takes the pot
// (2 * stake) minus the platform fee, and a draw or abort refunds both. All
// arithmetic is exact micro-USDC; the strings are display copies of it.
export interface WagerBreakdown {
  // What locks now (the stake).
  youLock: string;
  // Available balance after the lock, clamped at zero when it overdraws.
  balanceAfter: string;
  // The whole pot both sides make up.
  pot: string;
  // Platform fee taken from the pot on a decisive result.
  fee: string;
  // What the winner receives (pot minus fee).
  winnerReceives: string;
  // False when the stake exceeds the available balance.
  sufficient: boolean;
}

export function wagerBreakdown(
  stakeUsdc: string,
  availableUsdc: string,
  feeBps: number
): WagerBreakdown {
  const stake = toBaseUnits(stakeUsdc, USDC_DECIMALS);
  const available = toBaseUnits(availableUsdc, USDC_DECIMALS);
  const pot = stake * 2n;
  // Basis points floor, matching the service's integer fee math.
  const fee = (pot * BigInt(Math.max(0, Math.round(feeBps)))) / 10_000n;
  const sufficient = available >= stake;
  const after = sufficient ? available - stake : 0n;
  return {
    youLock: fromBaseUnits(stake, USDC_DECIMALS),
    balanceAfter: fromBaseUnits(after, USDC_DECIMALS),
    pot: fromBaseUnits(pot, USDC_DECIMALS),
    fee: fromBaseUnits(fee, USDC_DECIMALS),
    winnerReceives: fromBaseUnits(pot - fee, USDC_DECIMALS),
    sufficient,
  };
}
