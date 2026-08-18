// The smallest buy we accept, by where it settles.
//
// A buy that lands on Solana costs more to deliver than one on an EVM chain:
// the recipient's token account has to exist (rent), the route hops through
// the platform's sponsored funding, and a sub-dollar order can come out the
// far side worth less than it cost to move. So Solana buys start at 2 USDC;
// everywhere else the floor stays at 1. One rule, read by every buy surface,
// so the spot panel, the buy sheet and the RWA panel cannot drift apart.

import { SOLANA_CHAIN_ID } from "@/lib/deposit";

export const DEFAULT_MIN_BUY_USD = 1;
export const SOLANA_MIN_BUY_USD = 2;

/** The floor for a buy that settles on Solana, or anywhere else. */
export function minimumBuyUsd(settlesOnSolana: boolean): number {
  return settlesOnSolana ? SOLANA_MIN_BUY_USD : DEFAULT_MIN_BUY_USD;
}

/** Whether a Dextopus destination chain id is Solana. */
export function isSolanaChainId(chainId: number | null | undefined): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

/** True when an amount has been entered and it is under the floor for its chain. */
export function belowMinimumBuy(amountUsd: number, settlesOnSolana: boolean): boolean {
  return amountUsd > 0 && amountUsd < minimumBuyUsd(settlesOnSolana);
}
