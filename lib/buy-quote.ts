// Dextopus quote client for market buys. A buy quotes the user's USDC on Base
// into the chosen destination token/chain, delivered to the user's own wallet.
// Requests go through the /api/dextopus proxy. Amounts stay in integer base
// units (bigint) so we never lose precision to floating point.
//
// Field names are verified against the live API: the quote returns
// depositRequestId / amountOut (not the requestId / estimatedOutput the hosted
// docs list). The quote is EXACT_INPUT: send exactly the quoted amount to the
// deposit address within expiresInSeconds. dry mode is not used because the live
// API ignores it and mints a real request either way, so the "you get" preview
// is derived from market price and the real quote is only fetched at buy time.

import { apiFetch } from "@/lib/api";
import { toBaseUnits } from "@/lib/trade/math";
import { BUY_ORIGIN, type BuyRoute, settlementAddress } from "@/lib/buy";

export interface BuyQuoteInput {
  route: BuyRoute;
  // USDC to spend, in base units (6 decimals).
  amount: bigint;
  // The user's own wallet on the destination chain: where the bought token lands.
  recipient: string;
  // The user's Base wallet, refunded if the order cannot complete.
  refundTo: string;
  slippageBps: number;
}

export interface BuyQuote {
  // Expected destination token received, in that token's base units.
  estimatedOutput: bigint;
  // Guaranteed minimum after slippage, in base units.
  minOutput: bigint;
  // Where to send the USDC on Base.
  depositAddress: string;
  // Id to poll status against.
  requestId: string;
  // Seconds the quoted deposit address stays valid.
  expiresInSeconds: number;
}

// Build the Dextopus deposit/quote body for a buy. Pure, so it is unit tested.
export function buildBuyQuoteBody(input: BuyQuoteInput) {
  return {
    originChainId: BUY_ORIGIN.chainId,
    originAsset: BUY_ORIGIN.asset,
    destinationChainId: input.route.destinationChainId,
    // The catalog advertises SOL under the wSOL mint, which the quote
    // endpoint rejects; this resolves it to the address that settles.
    destinationAsset: settlementAddress(input.route.asset),
    amount: input.amount.toString(),
    recipient: input.recipient,
    refundTo: input.refundTo,
    slippageBps: input.slippageBps,
  };
}

interface RawBuyQuote {
  success?: boolean;
  depositRequestId?: string;
  depositAddress?: string;
  amountOut?: string;
  minAmountOut?: string;
  expiresInSeconds?: number;
}

// Parse an output amount the API may return either as integer base units
// ("38402") or a human decimal ("0.00038402"). Base units are the live shape;
// the decimal branch is a defensive fallback.
function parseOutput(value: string, decimals: number): bigint {
  const v = value.trim();
  return v.includes(".") ? toBaseUnits(v, decimals) : BigInt(v || "0");
}

export function normalizeBuyQuote(raw: RawBuyQuote, decimals: number): BuyQuote {
  if (raw.amountOut == null) throw new Error("The quote returned no output amount.");
  if (!raw.depositAddress || !raw.depositRequestId) {
    throw new Error("The quote did not return a deposit address.");
  }
  return {
    estimatedOutput: parseOutput(raw.amountOut, decimals),
    minOutput: parseOutput(raw.minAmountOut ?? raw.amountOut, decimals),
    depositAddress: raw.depositAddress,
    requestId: raw.depositRequestId,
    expiresInSeconds: raw.expiresInSeconds ?? 0,
  };
}

export async function fetchBuyQuote(input: BuyQuoteInput): Promise<BuyQuote> {
  const res = await apiFetch("/api/dextopus/deposit/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBuyQuoteBody(input)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.message === "string" ? data.message : "Couldn't complete your order.";
    throw new Error(message);
  }
  return normalizeBuyQuote(data, input.route.decimals);
}
