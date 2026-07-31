"use client";

// Client for the chess cashier: the backend-custody USDC balance that funds
// staked matches. Deposits are an on-chain USDC send to the cashier's deposit
// address followed by a confirm call; withdrawals and stake locks happen
// entirely server-side against the custodied balance.
//
// All money here travels as decimal strings ("10.5" USDC). Comparisons happen
// in exact base units, never floats.

import { chessGet, chessPost } from "@/lib/casino/api/chess-client";
import type { CasinoApiError } from "@/lib/casino/api/envelope";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

export const USDC_DECIMALS = 6;

export interface CashierConfig {
  chainId: number;
  tokenSymbol: string;
  tokenAddress: string;
  depositAddress: string;
  requiredConfirmations: number;
  // Platform fee on winnings, in basis points (500 = 5%).
  platformFeeBps: number;
}

export interface CashierBalance {
  player: string;
  availableUsdc: string;
  lockedUsdc: string;
  totalUsdc: string;
}

export interface CashierDeposit {
  amountUsdc: string;
  status: string;
}

export interface CashierWithdrawal {
  status: string;
  txHash: string;
}

export async function fetchCashierConfig(): Promise<CashierConfig> {
  return chessGet<CashierConfig>("/cashier/config");
}

export async function fetchChessBalance(wallet: string): Promise<CashierBalance> {
  return chessGet<CashierBalance>(`/cashier/players/${encodeURIComponent(wallet)}/balance`);
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
  const code = (error as CasinoApiError | null)?.code;
  return code === "CONFLICT" || code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
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
