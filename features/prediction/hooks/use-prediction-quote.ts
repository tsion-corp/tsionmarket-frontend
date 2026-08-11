"use client";

import { useMemo } from "react";
import { PRICE_SCALE, type Market, type Side } from "@/features/prediction/lib/types";
import { minOut, quoteBuy, quoteSell } from "@/features/prediction/lib/math";

// A pure trade preview off the cached/streamed reserves. No network: the live
// slippage guard the transaction actually uses is recomputed from a FRESH
// on-chain read inside use-prediction-actions, so this is display only.

export interface TradePreview {
  // Estimated output: shares for a buy, USDC for a sell (6-dec base units).
  out: bigint;
  // Guard floor at the given tolerance.
  minOut: bigint;
  // Average price paid per share, 0..PRICE_SCALE (buy only; 0 for a sell).
  avgPrice: bigint;
  valid: boolean;
}

const EMPTY: TradePreview = { out: 0n, minOut: 0n, avgPrice: 0n, valid: false };

export function useTradePreview(
  market: Market | undefined,
  mode: "buy" | "sell",
  side: Side,
  amount: bigint,
  toleranceBps: number
): TradePreview {
  return useMemo(() => {
    if (!market || amount <= 0n || market.rYes <= 0n || market.rNo <= 0n) return EMPTY;
    try {
      if (mode === "buy") {
        const { sharesOut } = quoteBuy(market.rYes, market.rNo, side, amount, market.feeBps);
        if (sharesOut <= 0n) return EMPTY;
        // Average price = USDC in / shares out, scaled to the price fixed point.
        const avgPrice = (amount * PRICE_SCALE) / sharesOut;
        return { out: sharesOut, minOut: minOut(sharesOut, toleranceBps), avgPrice, valid: true };
      }
      const { usdcOut } = quoteSell(market.rYes, market.rNo, side, amount, market.feeBps);
      if (usdcOut <= 0n) return EMPTY;
      return { out: usdcOut, minOut: minOut(usdcOut, toleranceBps), avgPrice: 0n, valid: true };
    } catch {
      // A sell larger than the pool can service throws; show it as invalid.
      return EMPTY;
    }
  }, [market, mode, side, amount, toleranceBps]);
}
