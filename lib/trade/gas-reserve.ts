import type { TokenBalance } from "@/lib/server/alchemy";
import { hasGasPolicyForNetwork } from "@/lib/trade/sponsored-evm";

// The wallet's own ETH on Base, for the case where Base sends are not
// gas-sponsored. Base is sponsored today (config/alchemy-bso-evm-networks.json,
// gasPolicy), and while it is, none of this is shown: sends never touch the
// user's ETH. If sponsorship is switched off, these thresholds decide when the
// portfolio asks the user to add some.

export const BASE_NETWORK = "base-mainnet";

// What we ask a wallet to keep on hand when it pays its own gas. Comfortably
// above the cost of a single send (lib/trade/gas-buffer.ts), so routine use
// doesn't bounce against it.
export const GAS_TARGET_USD = 1;

/** True when Base sends are paid by the user rather than sponsored. */
export function baseGasIsUserPaid(): boolean {
  return !hasGasPolicyForNetwork(BASE_NETWORK);
}

export function baseGasUsd(tokens: readonly TokenBalance[]): number {
  return tokens.find((t) => t.network === BASE_NETWORK && t.address === null)?.valueUsd ?? 0;
}

export function baseGasIsLow(tokens: readonly TokenBalance[]): boolean {
  return baseGasUsd(tokens) < GAS_TARGET_USD;
}
