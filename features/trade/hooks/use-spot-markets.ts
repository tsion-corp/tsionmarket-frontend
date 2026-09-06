"use client";

import { useMemo } from "react";
import { useBuyDestinations } from "@/features/trade/hooks/use-buy-catalog";
import { useMarketTokens } from "@/features/trade/hooks/use-market-tokens";
import { usePrices } from "@/hooks/use-prices";
import { composeSpotMarkets, spotSymbolsFor, type SpotMarket } from "@/lib/spot-markets";

export type { SpotMarket } from "@/lib/spot-markets";

const NO_SYMBOLS: string[] = [];

// The one spot universe, shared by the simple table and the pro terminal. The
// composition itself is lib/spot-markets, which the dashboard feed runs on the
// server; this hook only gathers the three inputs in the browser.
//
// `enabled: false` keeps every read idle. The dashboard used to call this
// unconditionally for a deep link it rarely receives, which kept a price poll
// running under a page whose brief already had the numbers from the feed.
export function useSpotMarkets({ enabled = true }: { enabled?: boolean } = {}) {
  const destinations = useBuyDestinations(enabled);
  const { data: feed = [] } = useMarketTokens("popular", enabled);

  const symbols = useMemo(
    () => (enabled && destinations.data ? spotSymbolsFor(destinations.data) : NO_SYMBOLS),
    [enabled, destinations.data]
  );
  const prices = usePrices(symbols);

  const markets: SpotMarket[] = useMemo(
    () => (destinations.data ? composeSpotMarkets(destinations.data, feed, prices) : []),
    [destinations.data, feed, prices]
  );

  return {
    markets,
    destinations,
    loading: enabled && destinations.isLoading,
    error: destinations.isError,
  };
}
