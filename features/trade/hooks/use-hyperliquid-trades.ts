"use client";

import { useEffect, useState } from "react";
import { subscribeTrades } from "@/features/trade/lib/hyperliquid-ws-client";
import { toTradeTicks, type HlTradeTick } from "@/features/trade/lib/hyperliquid-ws-types";

// Rolling window of the most recent trades for one asset — newest first,
// capped so the tape never grows unbounded on a fast-moving market.
const MAX_TRADES = 50;

export function useHyperliquidTrades(coin: string | null) {
  const [trades, setTrades] = useState<HlTradeTick[]>([]);
  // Adjusting state during render (React's documented pattern) rather than
  // in the effect body — see use-hyperliquid-order-book.ts for why.
  const [trackedCoin, setTrackedCoin] = useState(coin);
  if (coin !== trackedCoin) {
    setTrackedCoin(coin);
    setTrades([]);
  }

  useEffect(() => {
    if (!coin) return;
    const unsubscribe = subscribeTrades(coin, (event) => {
      setTrades((prev) => [...toTradeTicks(event).reverse(), ...prev].slice(0, MAX_TRADES));
    });
    return unsubscribe;
  }, [coin]);

  return { trades, connected: trades.length > 0 };
}
