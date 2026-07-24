"use client";

import { useCallback, useState } from "react";
import { OrderSide, OrderType } from "@polymarket/client";
import { usePolymarketSession, type SessionStatus } from "@/hooks/use-polymarket-session";
import { BUILDER_CODE } from "@/lib/polymarket/config";

export interface PlaceBetInput {
  // CLOB token of the outcome being bought (Yes token or No token).
  tokenId: string;
  // Collateral (pUSD) to spend, as a human amount.
  amountUsd: number;
}

// Places a real market buy on the chosen outcome token, attributed to the wsws
// builder code. Ensures the trading session (Deposit Wallet + approvals) is
// ready first, estimates the fill price, then submits a Fill-and-Kill order.
export function usePlaceBet() {
  const { ensureReady, status } = usePolymarketSession();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = useCallback(
    async ({ tokenId, amountUsd }: PlaceBetInput) => {
      setPlacing(true);
      setError(null);
      try {
        const client = await ensureReady();
        const amount = String(amountUsd);
        const maxPrice = await client.estimateMarketPrice({
          tokenId,
          side: OrderSide.BUY,
          amount,
          orderType: OrderType.FAK,
        });
        const res = await client.placeMarketOrder({
          tokenId,
          side: OrderSide.BUY,
          amount,
          maxPrice,
          orderType: OrderType.FAK,
          ...(BUILDER_CODE ? { builderCode: BUILDER_CODE as `0x${string}` } : {}),
        });
        if (!res.ok) throw new Error(res.message || "The order was not accepted.");
        return res;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not place the bet.";
        setError(message);
        throw e;
      } finally {
        setPlacing(false);
      }
    },
    [ensureReady]
  );

  return { place, placing, error, status: status as SessionStatus };
}
