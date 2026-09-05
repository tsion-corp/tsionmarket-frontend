"use client";

import { useEffect, useState } from "react";
import { subscribeL2Book } from "@/features/trade/lib/hyperliquid-ws-client";
import {
  toOrderBookSnapshot,
  type HlOrderBookSnapshot,
} from "@/features/trade/lib/hyperliquid-ws-types";

// Live L2 order book for one asset, over Hyperliquid's own public WebSocket
// (see hyperliquid-ws-client.ts).
export function useHyperliquidOrderBook(coin: string | null) {
  const [book, setBook] = useState<HlOrderBookSnapshot | null>(null);
  // Resets to null on every symbol change so a stale book from the previous
  // asset never flashes under the new one — adjusting state during render
  // (React's documented pattern) rather than in the effect body, which the
  // React Compiler's lint rule flags as a cascading-render risk.
  const [trackedCoin, setTrackedCoin] = useState(coin);
  if (coin !== trackedCoin) {
    setTrackedCoin(coin);
    setBook(null);
  }

  useEffect(() => {
    if (!coin) return;
    const unsubscribe = subscribeL2Book(coin, (event) => setBook(toOrderBookSnapshot(event)));
    return unsubscribe;
  }, [coin]);

  return { book, connected: book !== null };
}
