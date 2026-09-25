"use client";

// Exiting Polymarket positions: redeem a resolved winner, or sell an open
// position into the book. Plain functions over a SecureClient, so the same
// code serves the prediction hooks (Decane signer) and the migration adapter
// (old Privy signer).

import { OrderSide, OrderType } from "@polymarket/client";
import {
  approveErc1155ForAll,
  deployDepositWallet,
  fetchNegRisk,
  isWalletDeployed,
} from "@polymarket/client/actions";
import { BUILDER_CODE, CONTRACTS } from "@/lib/polymarket/config";
import type { SecureClient } from "@/lib/polymarket/secure-client";

export const NO_LIQUIDITY_MESSAGE =
  "Nobody is buying this outcome right now. Try again in a moment or hold to resolution.";

// A user-facing error whose message is already friendly.
export class CashoutError extends Error {}

export function isNoLiquidity(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /no orders found to match|no match|not enough liquidity|no liquidity/.test(m);
}

export function isApprovalError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /allowance|approval|not approved/.test(m);
}

// The lowest fill price a market SELL accepts, from the estimated crossing
// price: a small tolerance below the estimate so a normal book move between
// estimate and placement still fills, but the shares are never dumped far
// under it. Clamped to valid whole-cent ticks.
const SELL_SLIPPAGE = 0.03;

export function sellFloorPrice(estimate: number): number {
  const floored = Math.floor(estimate * (1 - SELL_SLIPPAGE) * 100) / 100;
  return Math.min(Math.max(floored, 0.01), 0.99);
}

// Deploys the signer's Deposit Wallet on first use and sets trading
// approvals. Idempotent: an existing wallet is left alone, re-granting an
// approval is a no-op on-chain.
export async function ensureDepositWallet(client: SecureClient): Promise<void> {
  if (!(await isWalletDeployed(client))) {
    const handle = await deployDepositWallet(client);
    await handle.wait();
  }
  await client.setupTradingApprovals();
}

// Grants the approvals a sell needs, for the case the SDK's own setup misses.
//
// setupTradingApprovals covers the exchanges and the collateral adapters, but
// its required-approvals list has no entry for the neg-risk adapter. Selling a
// position in a multi-candidate market goes through that adapter, so the CLOB
// rejects the order with "the allowance is not enough -> spender: 0xd91E80…"
// and the SDK's setup, having granted everything it knows about, reports
// success. Binary markets settle through the standard exchange, which is on the
// list, which is why only multi-candidate markets fail this way.
//
// Granting an approval that already exists is a no-op on-chain, so this only
// runs on the retry path, after the CLOB has actually complained.
export async function grantSellApprovals(client: SecureClient, tokenId: string): Promise<void> {
  await client.setupTradingApprovals();
  if (!(await fetchNegRisk(client, { tokenId }))) return;
  const handle = await approveErc1155ForAll(client, {
    operatorAddress: CONTRACTS.negRiskAdapter,
    tokenAddress: CONTRACTS.conditionalTokens,
  });
  // The order is rejected again unless the approval has actually landed.
  await handle.wait();
}

export interface MarketSellInput {
  // CLOB token of the held outcome (the position's tokenId).
  tokenId: string;
  // Shares to sell, the whole position for a full cash-out.
  shares: number;
}

export interface MarketSellResult {
  // Estimated proceeds in USD at the estimated fill price.
  proceedsUsd: number;
  // REVIEW(decane-migration): staging's markets workspace reads this to show a
  // "settlement pending" state. The migration's placeMarketSell does not set
  // it, so it stays undefined (the pending branch simply never fires). Wire it
  // through placeMarketSell if that UX is still wanted.
  settlementPending?: boolean;
}

// A market SELL crossing the spread at the current bid, floored so a book
// move never turns into a silent dump. Throws CashoutError(NO_LIQUIDITY_MESSAGE)
// when there is no bid to sell into.
export async function placeMarketSell(
  client: SecureClient,
  input: MarketSellInput
): Promise<MarketSellResult> {
  const shares = String(input.shares);
  const estimate = await client.estimateMarketPrice({
    tokenId: input.tokenId,
    side: OrderSide.SELL,
    shares,
    orderType: OrderType.FAK,
  });
  if (!(estimate > 0)) throw new CashoutError(NO_LIQUIDITY_MESSAGE);

  const res = await client.placeMarketOrder({
    tokenId: input.tokenId,
    side: OrderSide.SELL,
    shares,
    minPrice: sellFloorPrice(estimate),
    orderType: OrderType.FAK,
    ...(BUILDER_CODE ? { builderCode: BUILDER_CODE as `0x${string}` } : {}),
  });
  if (!res.ok) throw new Error(res.message || "The sell was not accepted.");
  return { proceedsUsd: input.shares * estimate };
}

// placeMarketSell with the one retry that fixes a missing ERC-1155 operator
// approval on multi-candidate markets.
export async function sellWithApprovalRetry(
  client: SecureClient,
  input: MarketSellInput,
  onApproving?: () => void
): Promise<MarketSellResult> {
  try {
    return await placeMarketSell(client, input);
  } catch (e) {
    if (!isApprovalError(e)) throw e;
    onApproving?.();
    await grantSellApprovals(client, input.tokenId);
    return placeMarketSell(client, input);
  }
}

// Claims winnings from a resolved market, converting the winning outcome
// tokens back to pUSD. Gasless via the builder relayer.
export async function redeemCondition(client: SecureClient, conditionId: string): Promise<void> {
  const handle = await client.redeemPositions({ conditionId });
  await handle.wait();
}
