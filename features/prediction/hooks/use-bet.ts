"use client";

import { useCallback, useState } from "react";
import { OrderSide, OrderType } from "@polymarket/client";
import { friendlyError } from "@/lib/errors";
import {
  usePolymarketSession,
  type SessionStatus,
} from "@/features/prediction/hooks/use-polymarket-session";
import { usePolymarketFunding } from "@/features/prediction/hooks/use-polymarket-funding";
import {
  readCollateralUsd,
  waitForCollateralUsd,
} from "@/features/prediction/lib/polymarket/collateral";
import { ensureNegRiskBuyAllowance } from "@/features/prediction/lib/polymarket/allowance";
import { BUILDER_CODE } from "@/lib/polymarket/config";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";
import {
  isValidPredictionStake,
  predictionMinimumStakeMessage,
} from "@/features/prediction/lib/stake";

export type BetPhase = "idle" | "placing" | "funding" | "settling" | "approving";

// Polymarket's deposit bridge silently ignores deposits below a per-asset
// minimum; Base USDC is $2 (bridge /supported-assets). Fund at least this so a
// small shortfall isn't sent and lost.
const MIN_DEPOSIT_USD = 2;

// A market buy must cross the spread to fill. maxPrice is the highest price per
// share we accept, so set it a little above the estimate: the order still fills
// at the real ask (never worse), but a normal spread or a small book move
// between estimate and placement no longer kills a Fill-and-Kill order.
const PRICE_SLIPPAGE = 0.03;
const PRICE_SCALE = 1_000_000n;

function scaledDecimal(value: bigint): string {
  const whole = value / PRICE_SCALE;
  const fraction = (value % PRICE_SCALE).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function marketBuyMaxPrice(estimate: number, tickSize: number): string {
  const tick = BigInt(Math.round(tickSize * Number(PRICE_SCALE)));
  if (!Number.isFinite(estimate) || estimate <= 0 || tick <= 0n || tick >= PRICE_SCALE) {
    throw new BetError("This market returned an invalid executable price.");
  }

  const protectedPrice = BigInt(Math.ceil(estimate * (1 + PRICE_SLIPPAGE) * Number(PRICE_SCALE)));
  const highestPrice = PRICE_SCALE - tick;
  const bounded =
    protectedPrice < tick ? tick : protectedPrice > highestPrice ? highestPrice : protectedPrice;

  // BUY maxPrice must align to the market's live tick. Round up so the intended
  // protection still crosses the estimated ask instead of failing by one tick.
  const aligned = ((bounded + tick - 1n) / tick) * tick;
  return scaledDecimal(aligned > highestPrice ? highestPrice : aligned);
}

// A user-facing error whose message is already friendly, so the outer handler
// shows it verbatim instead of running it through the generic translator.
class BetError extends Error {}

// True when the order couldn't match because the book is empty or too thin at
// our price. Funding won't help, so this stops the flow with a clear message.
function isNoLiquidity(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /no orders found to match|no match|not enough liquidity|no liquidity/.test(m);
}

const NO_LIQUIDITY_MESSAGE =
  "This market doesn't have matching orders right now. Try again in a moment, a different amount, or another market.";

function orderErrorMessage(e: unknown): string | null {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    /allowance is not enough|balance is not enough|insufficient balance|exceeds allowance/.test(
      message
    )
  ) {
    return "Your prediction balance or trading approval is still updating. Wait a few seconds and try again.";
  }
  if (/minimum order|min(?:imum)? size|below minimum/.test(message)) {
    return "This market requires a larger stake than the current amount.";
  }
  if (/invalid signature|signature verification/.test(message)) {
    return "Polymarket rejected the wallet signature. Reconnect your wallet and try again.";
  }
  if (/restricted|not available in your region|geoblock/.test(message)) {
    return "This market is not available in your region.";
  }
  if (/closed|not accepting orders|invalid token|market not found/.test(message)) {
    return "This market is no longer accepting orders. Choose another market.";
  }
  return null;
}

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
  const [predictionBalanceUsd, setPredictionBalanceUsd] = useState<number | null>(null);

  const placeOrder = useCallback(async (client: SecureClient, input: PlaceBetInput) => {
    const amount = String(input.amountUsd);
    const book = await client.fetchOrderBook({ tokenId: input.tokenId });
    if (book.asks.length === 0) throw new BetError(NO_LIQUIDITY_MESSAGE);

    const estimate = await client.estimateMarketPrice({
      tokenId: input.tokenId,
      side: OrderSide.BUY,
      amount,
      orderType: OrderType.FAK,
    });
    // No ask depth to model a price against: the book is empty.
    if (!(estimate > 0)) throw new BetError(NO_LIQUIDITY_MESSAGE);

    if (book.negRisk) {
      setPhase("approving");
      await ensureNegRiskBuyAllowance(
        client,
        BigInt(Math.ceil(input.amountUsd * Number(PRICE_SCALE)))
      );
      setPhase("placing");
    }

    const res = await client.placeMarketOrder({
      tokenId: input.tokenId,
      side: OrderSide.BUY,
      amount,
      // The entered stake is the all-in maximum. Without maxSpend the SDK adds
      // taker fees on top, which can exceed an exactly funded pUSD balance.
      maxSpend: amount,
      maxPrice: marketBuyMaxPrice(estimate, book.tickSize),
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
        // Enforce the product floor before creating a session, requesting a
        // sponsored approval, or moving any USDC across the bridge.
        if (!isValidPredictionStake(input.amountUsd)) {
          throw new BetError(predictionMinimumStakeMessage());
        }
        const client = await ensureReady();

        // Reuse pUSD the account already holds; only fund what's missing.
        let available = await readCollateralUsd(client);
        setPredictionBalanceUsd(available);
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
          available = await waitForCollateralUsd(client, input.amountUsd, {
            initialAvailableUsd: available,
          });
          setPredictionBalanceUsd(available);
          if (available < input.amountUsd) {
            throw new BetError(
              "Your Base transfer succeeded, but the Polygon pUSD credit is still pending. It will remain available for the next attempt."
            );
          }
        }

        setPhase("placing");
        const result = await placeOrder(client, input);
        void readCollateralUsd(client)
          .then(setPredictionBalanceUsd)
          .catch(() => undefined);
        return result;
      } catch (e) {
        if (e instanceof BetError) {
          setError(e.message);
          throw e;
        }
        if (isNoLiquidity(e)) {
          setError(NO_LIQUIDITY_MESSAGE);
          throw e;
        }
        const orderMessage = orderErrorMessage(e);
        if (orderMessage) {
          console.error("[prediction] Polymarket order rejected", e);
          setError(orderMessage);
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
    predictionBalanceUsd,
    portfolioLoading,
  };
}
