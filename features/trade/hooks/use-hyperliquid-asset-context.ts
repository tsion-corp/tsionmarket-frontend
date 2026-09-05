"use client";

import { useEffect, useState } from "react";
import { subscribeAssetContext } from "@/features/trade/lib/hyperliquid-ws-client";
import { toAssetContext, type HlAssetContext } from "@/features/trade/lib/hyperliquid-ws-types";

// Live mark/oracle/24h-change/volume/open-interest/funding for one asset —
// what the pro view's market header bar reads from. Independent of the
// REST-polled `useHyperliquidPrices` (features/trade/hooks/use-hyperliquid-markets.ts),
// which stays as the simple view's price source; this hook exists for the
// richer header data REST prices alone don't carry.
export function useHyperliquidAssetContext(coin: string | null) {
  const [context, setContext] = useState<HlAssetContext | null>(null);
  // Adjusting state during render (React's documented pattern) rather than
  // in the effect body — see use-hyperliquid-order-book.ts for why.
  const [trackedCoin, setTrackedCoin] = useState(coin);
  if (coin !== trackedCoin) {
    setTrackedCoin(coin);
    setContext(null);
  }

  useEffect(() => {
    if (!coin) return;
    const unsubscribe = subscribeAssetContext(coin, (event) => setContext(toAssetContext(event)));
    return unsubscribe;
  }, [coin]);

  return { context, connected: context !== null };
}
