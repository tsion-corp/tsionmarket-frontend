"use client";

import { useQuery } from "@tanstack/react-query";
import { getAccountState, getPrices, listAssets } from "@/features/trade/lib/hyperliquid-api";

const ASSETS_STALE_MS = 5 * 60_000;
// This is a DISPLAY price only — order execution always re-reads a fresh
// mid server-side at submit time (TradingService.marketPrice), so the
// client can afford to be considerably less fresh than the trade itself
// needs to be. Was 3s (fetching all assets' mids, ~16KB, every tick); at
// real user volume that's real, avoidable load for a number nothing
// actually trades against.
const PRICES_POLL_MS = 10_000;

// TEMPORARY ROLLOUT GATE: only crypto is user-visible for now. The HIP-3
// categories (equities, forex, commodities, indices) are live and e2e-tested
// on the backend, but stay hidden until each is verified for release. To
// roll them out, add categories here (or drop the filter entirely) and
// un-comment the matching labels in hyperliquid-asset-picker.tsx.
const RELEASED_CATEGORIES = new Set(["crypto"]);

export function useHyperliquidAssets() {
  const query = useQuery({
    queryKey: ["hl-assets"],
    queryFn: listAssets,
    staleTime: ASSETS_STALE_MS,
  });
  const assets = (query.data ?? []).filter((a) => RELEASED_CATEGORIES.has(a.category ?? "crypto"));
  return { assets, loading: query.isLoading };
}

export function useHyperliquidPrices(enabled = true) {
  const query = useQuery({
    queryKey: ["hl-prices"],
    queryFn: getPrices,
    enabled,
    refetchInterval: PRICES_POLL_MS,
  });
  return { prices: query.data ?? {}, loading: query.isLoading };
}

// A wallet's live HyperCore margin/balance — the source of truth for how
// much is free to trade with and whether a bridge is needed before an order.
// No background poll: every action that can move this balance (top-up,
// withdraw, place/close a trade, TP/SL) already refetches it explicitly on
// completion (see hyperliquid-actions.ts's callers). This still catches
// externally-driven changes (funding, liquidation) via the app-wide
// refetchOnWindowFocus/refetchOnReconnect defaults (lib/query-client.ts) —
// it just doesn't pay for a fetch every few seconds while nothing happened.
export function useHyperliquidClearinghouse(address: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["hl-clearinghouse", address],
    queryFn: () => getAccountState(address as string),
    enabled: enabled && address != null,
  });
  return { state: query.data ?? null, loading: query.isLoading, refetch: query.refetch };
}
