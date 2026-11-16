import type { TokenBalance } from "@/lib/server/alchemy";

// Base sends are no longer gas-sponsored (see config/alchemy-bso-evm-networks.json),
// so every wallet needs a little of its own ETH on Base to pay for them. These
// thresholds are the single source of truth for "how much" and "how low is low",
// shared by the portfolio notice and the automatic top-up.

export const BASE_NETWORK = "base-mainnet";

// What we ask a wallet to keep on hand. Comfortably above the cost of a single
// send (lib/trade/gas-buffer.ts's own base-mainnet reserve), so routine use
// doesn't bounce against it.
export const GAS_TARGET_USD = 1;

// Below this we treat the balance as "empty" rather than merely low, and that
// is what triggers an automatic top-up — on the next deposit, not on every
// small dip under the target.
export const GAS_EMPTY_USD = 0.05;

export function baseGasUsd(tokens: readonly TokenBalance[]): number {
  return tokens.find((t) => t.network === BASE_NETWORK && t.address === null)?.valueUsd ?? 0;
}

export function baseGasIsEmpty(tokens: readonly TokenBalance[]): boolean {
  return baseGasUsd(tokens) < GAS_EMPTY_USD;
}

export function baseGasIsLow(tokens: readonly TokenBalance[]): boolean {
  return baseGasUsd(tokens) < GAS_TARGET_USD;
}
