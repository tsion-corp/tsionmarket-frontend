"use client";

import { useCallback, useState } from "react";
import { OrderSide, OrderType } from "@polymarket/client";
import { friendlyError } from "@/lib/errors";
import {
  usePolymarketSession,
  type SessionStatus,
} from "@/features/prediction/hooks/use-polymarket-session";
import { usePolymarketFunding } from "@/features/prediction/hooks/use-polymarket-funding";
import { readCollateralUsd } from "@/features/prediction/lib/polymarket/collateral";
import { BUILDER_CODE, CONTRACTS } from "@/lib/polymarket/config";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";

export type BetPhase = "idle" | "placing" | "funding" | "settling" | "approving";

// How long to keep waiting while the deposit bridge credits pUSD.
const SETTLE_POLL_MS = 5000;
const SETTLE_MAX_MS = 120_000;

// Polymarket's deposit bridge silently ignores deposits below a per-asset
// minimum; Base USDC is $2 (bridge /supported-assets). Fund at least this so a
// small shortfall isn't sent and lost.
const MIN_DEPOSIT_USD = 2;

// A market buy must cross the spread to fill. maxPrice is the highest price per
// share we accept, so set it a little above the estimate: the order still fills
// at the real ask (never worse), but a normal spread or a small book move
// between estimate and placement no longer kills a Fill-and-Kill order.
const PRICE_SLIPPAGE = 0.03;
// Prediction prices are 0..1. Cap just below 1, and round to whole cents so the
// price is always a valid tick (0.01 divides every market's tick size).
const MAX_SHARE_PRICE = 0.99;

function crossingPrice(estimate: number): number {
  const bumped = Math.ceil(estimate * (1 + PRICE_SLIPPAGE) * 100) / 100;
  return Math.min(Math.max(bumped, 0.01), MAX_SHARE_PRICE);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A user-facing error whose message is already friendly, so the outer handler
// shows it verbatim instead of running it through the generic translator.
class BetError extends Error {}

// True when the order couldn't match because the book is empty or too thin at
// our price. Funding won't help, so this stops the flow with a clear message.
function isNoLiquidity(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /no orders found to match|no match|not enough liquidity|no liquidity/.test(m);
}

// True when the order was rejected for a missing/insufficient token allowance
// (the exchange isn't approved to spend the account's pUSD yet). The fix is to
// set trading approvals and retry, not to add funds.
function isAllowanceError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /allowance/.test(m);
}

// The exchange contract the rejected order needs allowance for. Polymarket
// fetches this per-market, so it isn't in our config; the CLOB error names it,
// e.g. "spender: 0xABC…". We approve exactly that address.
function extractSpender(e: unknown): string | null {
  const m = e instanceof Error ? e.message : String(e);
  const match = m.match(/spender:\s*(0x[0-9a-fA-F]{40})/);
  return match ? match[1] : null;
}

const NO_LIQUIDITY_MESSAGE =
  "This market doesn't have matching orders right now. Try again in a moment, a different amount, or another market.";

export interface PlaceBetInput {
  // CLOB token of the outcome being bought (Yes or No token).
  tokenId: string;
  // Dollars to stake.
  amountUsd: number;
}

// The whole bet flow behind one action. It reads the account's spendable pUSD
// first and only moves the shortfall from Base USDC, so existing balance is
// reused and a stake is never funded twice. Then it places a market order,
// crossing the spread so it actually fills.
export function useBet() {
  const { ensureReady, status: sessionStatus } = usePolymarketSession();
  const { fund, usdcTotal, portfolioLoading } = usePolymarketFunding();
  const [phase, setPhase] = useState<BetPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const placeOrder = useCallback(async (client: SecureClient, input: PlaceBetInput) => {
    const amount = String(input.amountUsd);
    const estimate = await client.estimateMarketPrice({
      tokenId: input.tokenId,
      side: OrderSide.BUY,
      amount,
      orderType: OrderType.FAK,
    });
    // No ask depth to model a price against: the book is empty.
    if (!(estimate > 0)) throw new BetError(NO_LIQUIDITY_MESSAGE);

    const res = await client.placeMarketOrder({
      tokenId: input.tokenId,
      side: OrderSide.BUY,
      amount,
      maxPrice: crossingPrice(estimate),
      orderType: OrderType.FAK,
      ...(BUILDER_CODE ? { builderCode: BUILDER_CODE as `0x${string}` } : {}),
    });
    if (!res.ok) throw new Error(res.message || "The order was not accepted.");
    return res;
  }, []);

  const placeBet = useCallback(
    async (input: PlaceBetInput) => {
      setError(null);
      setPhase("placing");
      try {
        const client = await ensureReady();

        // Reuse pUSD the account already holds; only fund what's missing.
        let available = await readCollateralUsd(client);
        if (available < input.amountUsd) {
          // The bridge silently drops deposits below its per-asset minimum
          // ($2 for Base USDC, per bridge /supported-assets), so never send less.
          // The extra over the shortfall lands as reusable pUSD, not lost.
          const shortfall = Math.ceil((input.amountUsd - available) * 100) / 100;
          const deposit = Math.max(shortfall, MIN_DEPOSIT_USD);
          if (!portfolioLoading && usdcTotal < deposit) {
            throw new BetError(
              `You need at least $${deposit.toFixed(2)} USDC on Base for this, but have $${usdcTotal.toFixed(2)}. Add USDC first.`
            );
          }
          setPhase("funding");
          await fund(deposit);

          // Wait for the bridge to credit the pUSD before placing.
          setPhase("settling");
          const started = Date.now();
          while (available < input.amountUsd && Date.now() - started < SETTLE_MAX_MS) {
            await delay(SETTLE_POLL_MS);
            available = await readCollateralUsd(client);
          }
          if (available < input.amountUsd) {
            throw new BetError(
              "Your funds are on the way. This can take a minute, so try placing the bet again shortly."
            );
          }
        }

        setPhase("placing");
        try {
          return await placeOrder(client, input);
        } catch (e) {
          if (!isAllowanceError(e)) throw e;
          // The order's exchange isn't approved to spend the account's pUSD.
          // setupTradingApprovals doesn't cover this market's spender, so approve
          // exactly the one the error names (pUSD -> that spender), then retry.
          setPhase("approving");
          const spender = extractSpender(e);
          if (spender) {
            const handle = await client.approveErc20({
              amount: "max",
              spenderAddress: spender,
              tokenAddress: CONTRACTS.pusd,
            });
            await handle.wait();
          } else {
            await client.setupTradingApprovals();
          }
          setPhase("placing");
          return await placeOrder(client, input);
        }
      } catch (e) {
        if (e instanceof BetError) {
          setError(e.message);
          throw e;
        }
        if (isNoLiquidity(e)) {
          setError(NO_LIQUIDITY_MESSAGE);
          throw e;
        }
        setError(friendlyError(e, "Couldn't place your bet. Try again."));
        throw e;
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady, fund, placeOrder, usdcTotal, portfolioLoading]
  );

  return {
    placeBet,
    phase,
    error,
    sessionStatus: sessionStatus as SessionStatus,
    usdcTotal,
    portfolioLoading,
  };
}
