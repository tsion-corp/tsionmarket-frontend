"use client";

import { useQuery } from "@tanstack/react-query";
import { getMarketContexts } from "@/features/trade/lib/hyperliquid-api";

// Mark/24h-change/funding/volume/open-interest for every active asset — the
// market list's data source. REST-polled like the rest of this app's market
// data; a dedicated live WS subscription per row isn't worth it for a list
// this size, and Hyperliquid's own `metaAndAssetCtxs` is already a single
// call for every asset at once. This payload is the heaviest of the perps
// polls (every active asset's full context, ~40KB) — the selected asset
// already gets sub-second freshness from use-hyperliquid-asset-context.ts's
// live WS subscription, so this REST poll only needs to keep the rest of
// the list reasonably current, not real-time.
const POLL_MS = 20_000;

export function useHyperliquidMarketContexts(enabled = true) {
  const query = useQuery({
    queryKey: ["hl-market-contexts"],
    queryFn: getMarketContexts,
    enabled,
    refetchInterval: POLL_MS,
  });
  return { contexts: query.data ?? [], loading: query.isLoading };
}
