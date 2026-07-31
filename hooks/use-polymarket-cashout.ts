"use client";

import { useCallback, useState } from "react";
import { OrderSide, OrderType } from "@polymarket/client";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/hooks/use-polymarket-session";
import { sellFloorPrice } from "@/lib/prediction";
import { BUILDER_CODE } from "@/lib/polymarket/config";
import type { SecureClient } from "@/lib/polymarket/secure-client";

export type CashoutPhase = "idle" | "selling" | "approving";

// A user-facing error whose message is already friendly.
class CashoutError extends Error {}

function isNoLiquidity(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /no orders found to match|no match|not enough liquidity|no liquidity/.test(m);
}

function isApprovalError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /allowance|approval|not approved/.test(m);
}

const NO_LIQUIDITY_MESSAGE =
  "Nobody is buying this outcome right now. Try again in a moment or hold to resolution.";

export interface CashOutInput {
  // CLOB token of the held outcome (the position's tokenId).
  tokenId: string;
  // Shares to sell — the whole position for a full cash-out.
  shares: number;
}

export interface CashOutResult {
  // Estimated proceeds in USD at the estimated fill price.
  proceedsUsd: number;
}

// Sells a held position back into the market before resolution — the standard
// Polymarket early cash-out. A market SELL crosses the spread at the current
// bid; the floor price tolerates a small book move but never a silent dump far
// below the estimate. Proceeds land as pUSD in the prediction balance, where
// the existing cash-out-to-Base flow can move them home.
export function usePolymarketCashout() {
  const { ensureReady } = usePolymarketSession();
  const [phase, setPhase] = useState<CashoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const placeSell = useCallback(async (client: SecureClient, input: CashOutInput) => {
    const shares = String(input.shares);
    const estimate = await client.estimateMarketPrice({
      tokenId: input.tokenId,
      side: OrderSide.SELL,
      shares,
      orderType: OrderType.FAK,
    });
    // No bid depth to sell into: the book is empty on the buy side.
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
  }, []);

  const cashOut = useCallback(
    async (input: CashOutInput): Promise<CashOutResult> => {
      setError(null);
      setPhase("selling");
      try {
        const client = await ensureReady();
        try {
          return await placeSell(client, input);
        } catch (e) {
          if (!isApprovalError(e)) throw e;
          // Selling conditional tokens needs the ERC-1155 operator approval
          // the standard trading setup grants; set it and retry once.
          setPhase("approving");
          await client.setupTradingApprovals();
          setPhase("selling");
          return await placeSell(client, input);
        }
      } catch (e) {
        if (e instanceof CashoutError) {
          setError(e.message);
          throw e;
        }
        if (isNoLiquidity(e)) {
          setError(NO_LIQUIDITY_MESSAGE);
          throw e;
        }
        setError(friendlyError(e, "Couldn't cash out this position. Try again."));
        throw e;
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady, placeSell]
  );

  return { cashOut, phase, error };
}
