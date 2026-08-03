"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  getCategories,
  getMarket,
  getMarketChart,
  getMarketTrades,
  listMarkets,
} from "@/lib/prediction/api";
import type { ChartInterval, MarketStatus } from "@/lib/prediction/types";

// React Query reads for the prediction market. REST is the first paint and a
// background safety net; on the detail page the WS stream overlays live ticks on
// top of these cached values, so the poll intervals stay relaxed.

export function useMarkets(status?: MarketStatus, category?: string) {
  return useQuery({
    queryKey: ["prediction", "markets", status ?? null],
    queryFn: () => listMarkets(status),
    // Category isn't a server filter; derive it here so one cache per status
    // serves every category tab.
    select: category ? (markets) => markets.filter((m) => m.category === category) : undefined,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMarket(id: string | null) {
  return useQuery({
    queryKey: ["prediction", "market", id],
    queryFn: () => getMarket(id as string),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useMarketChart(id: string | null, interval: ChartInterval) {
  return useQuery({
    queryKey: ["prediction", "chart", id, interval],
    queryFn: () => getMarketChart(id as string, interval),
    enabled: !!id,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useMarketTrades(id: string | null) {
  return useQuery({
    queryKey: ["prediction", "trades", id],
    queryFn: () => getMarketTrades(id as string),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["prediction", "categories"],
    queryFn: getCategories,
    staleTime: 300_000,
  });
}

// A freshly-created market only lands in the read-model once the chain indexer
// mirrors its MarketCreated event (a poll cycle after the tx confirms), so a
// single invalidate right after create usually refetches too early to see it.
// This polls the markets list — invalidating the prediction cache each round so
// every consumer refreshes — until the target market appears or we time out,
// giving the UI a "refresh itself after create" behavior without a manual reload.
export async function refreshMarketsUntilPresent(
  queryClient: QueryClient,
  marketId: bigint,
  { attempts = 10, intervalMs = 1500 }: { attempts?: number; intervalMs?: number } = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Invalidate broadly so any mounted prediction query (grid, positions, etc.)
    // refetches in step with our probe.
    await queryClient.invalidateQueries({ queryKey: ["prediction"] });
    try {
      const markets = await listMarkets();
      if (markets.some((m) => m.marketId === marketId)) return true;
    } catch {
      // Transient read failure — keep trying until attempts run out.
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  // Give up polling but leave the cache invalidated so the next background
  // refetch (or the 30s interval) will still surface the market eventually.
  return false;
}
