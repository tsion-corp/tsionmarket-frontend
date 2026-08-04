// Chain constants and pure helpers for the on-chain prediction market. No React
// imports so hooks and pure logic can both use it.

import type { Side } from "@/lib/prediction/types";

// Base mainnet. The gasless sponsor path in use-evm-send only works here.
export const PREDICTION_CHAIN_ID = 8453;

// Native Circle USDC on Base, the market's collateral (6 decimals).
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Flat market-creation fee, in USDC base units ($1). The contract pulls this
// from the creator on createMarket, so approvals must cover seed + this.
// NOTE: confirm the fee token (USDC vs native ETH) against the deployed contract
// before mainnet use; if it is ETH this becomes a `value`, not part of the
// approval. See the plan's open items.
export const CREATION_FEE_USDC = 1_000_000n;

// One large approval instead of one per trade. The allowance is consumed on
// every buy/addLiquidity, so approving the exact amount would force an approve
// before each trade. A billion USDC is far beyond any realistic exposure while
// staying a readable, non-infinite figure. Matches the perp flow's constant.
export const LARGE_APPROVAL_USDC = 1_000_000_000_000_000n;

// On-chain side encoding: 0 = YES, 1 = NO.
export function sideToUint(side: Side): 0 | 1 {
  return side === "yes" ? 0 : 1;
}

// ERC-1155 token id for a market outcome: marketId * 2 + side.
export function tokenId(marketId: bigint, side: Side): bigint {
  return marketId * 2n + BigInt(sideToUint(side));
}

// The PredictionMarket contract address from the environment. Throws with a
// clear message when unset so a misconfigured deploy fails loudly instead of
// sending to the zero address.
export function predictionContractAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS;
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error("Prediction market contract address is not configured.");
  }
  return addr as `0x${string}`;
}

// Whether an approve step must ride along: the current allowance does not cover
// this spend. Exact bigint compare.
export function needsApproval(allowance: bigint, spend: bigint): boolean {
  return allowance < spend;
}

// Generates an unused market id off-chain (the contract lets the creator pick
// the id; anyone may create). Shared by the single-market create flow and the
// multi-outcome event flow.
//
// 128 BITS, not the full 256: the contract derives each side's ERC-1155 token id
// as `(marketId << 1) | side`, so a full-width uint256 id overflows that shift
// and the create reverts with "id too large". A 128-bit random space leaves the
// top bits clear (no overflow, fits any packed-id bound) while remaining
// collision-free in practice — 2^128 ids, so a birthday collision is
// astronomically unlikely across every market this platform could ever create.
export function randomMarketId(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let id = 0n;
  for (const b of bytes) id = (id << 8n) | BigInt(b);
  return id;
}
