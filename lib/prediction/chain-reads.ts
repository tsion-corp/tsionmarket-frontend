// On-chain reads for the prediction market, pinned to Base. Reserves and fee are
// read fresh here (never trusted from a possibly-stale REST/WS value) right
// before a trade so the slippage guard is computed against the live pool.

import { erc20Abi } from "viem";
import { encodeAllowanceCall, parseAllowance } from "@/lib/trade/erc20";
import { publicClientForChain } from "@/lib/trade/receipt";
import { PREDICTION_ABI } from "@/lib/prediction/abi";
import {
  PREDICTION_CHAIN_ID,
  USDC_ADDRESS,
  predictionContractAddress,
  tokenId,
} from "@/lib/prediction/logic";
import type { Side } from "@/lib/prediction/types";

export interface PoolState {
  rYes: bigint;
  rNo: bigint;
  totalLp: bigint;
  feeBps: number;
  collateral: bigint;
  creator: string;
}

function client() {
  return publicClientForChain(PREDICTION_CHAIN_ID);
}

// Live pool state for slippage math. Reads the `markets` view struct.
export async function readPoolState(marketId: bigint): Promise<PoolState> {
  const result = await client().readContract({
    address: predictionContractAddress(),
    abi: PREDICTION_ABI,
    functionName: "markets",
    args: [marketId],
  });
  const [, , , creator, rYes, rNo, totalLp, feeBps, collateral] = result;
  return { rYes, rNo, totalLp, feeBps: Number(feeBps), collateral, creator };
}

// The neg-risk group a market belongs to, or 0n when it is standalone. Grouped
// members resolve together through resolveNegRiskGroup; calling resolve() on one
// reverts, so the UI reads this before offering a per-market resolve.
//
// Read on-chain rather than from the read-model: this is the contract's own
// answer, it needs no indexer backfill, and it is correct the moment the group
// is registered.
export async function readGroupOfMarket(marketId: bigint): Promise<bigint> {
  return client().readContract({
    address: predictionContractAddress(),
    abi: PREDICTION_ABI,
    functionName: "groupOfMarket",
    args: [marketId],
  });
}

// Unix seconds after which a resolved market's winnings may be redeemed. 0 means
// now: owner resolutions, invalid markets, and everything created before v1.2.0.
// Redeeming earlier reverts with "challenge window".
export async function readRedeemableAt(marketId: bigint): Promise<number> {
  const result = await client().readContract({
    address: predictionContractAddress(),
    abi: PREDICTION_ABI,
    functionName: "markets",
    args: [marketId],
  });
  return Number(result[9]);
}

// Current USDC allowance granted to the prediction contract by `owner`.
export async function readUsdcAllowance(owner: string): Promise<bigint> {
  const { data } = await client().call({
    to: USDC_ADDRESS as `0x${string}`,
    data: encodeAllowanceCall(owner, predictionContractAddress()),
  });
  return parseAllowance(data ?? "0x");
}

// The wallet's USDC balance on Base, read fresh to gate a spend (create/buy/add
// liquidity) with a specific "insufficient balance" error before the user signs
// a transaction that would otherwise revert on transferFrom.
export async function readUsdcBalance(owner: string): Promise<bigint> {
  return client().readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  });
}

// The wallet's ERC-1155 balance of one outcome's shares, to cap a sell.
export async function readShareBalance(
  owner: string,
  marketId: bigint,
  side: Side
): Promise<bigint> {
  return client().readContract({
    address: predictionContractAddress(),
    abi: PREDICTION_ABI,
    functionName: "balanceOf",
    args: [owner as `0x${string}`, tokenId(marketId, side)],
  });
}

// Claimable USDC credited by redeem(), pulled out by claim().
export async function readPendingWithdrawals(owner: string): Promise<bigint> {
  return client().readContract({
    address: predictionContractAddress(),
    abi: PREDICTION_ABI,
    functionName: "pendingWithdrawals",
    args: [owner as `0x${string}`],
  });
}
