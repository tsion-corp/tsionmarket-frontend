"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchPerpMarket,
  fetchPerpPairs,
  fetchPerpPrices,
  isPerpUnavailable,
} from "@/lib/perp/api";
import { isLikelyClosed } from "@/lib/perp/logic";
import type { PerpPair, PerpPairMarket, PerpPrice } from "@/lib/perp/types";

// Market data hooks for the perp section. Pair config barely changes, so it is
// fetched once and kept; prices and per-market metrics poll every few seconds
// (the doc's guidance to avoid RPC 429s: a sane interval, never a tight loop).
// All three report `unavailable` distinctly from a transient error, so the UI
// can show its preview state while the gateway is not deployed yet without
// hiding real failures behind it.

const PRICE_POLL_MS = 5_000;
const MARKET_POLL_MS = 5_000;
const PAIRS_STALE_MS = 5 * 60 * 1000;

// Not-deployed is terminal for the session: retrying cannot fix it, so stop
// after the first response instead of hammering the proxy.
function retryUnlessUnavailable(failureCount: number, error: unknown): boolean {
  if (isPerpUnavailable(error)) return false;
  return failureCount < 2;
}

export function usePerpPairs() {
  const query = useQuery<PerpPair[]>({
    queryKey: ["perp-pairs"],
    queryFn: () => fetchPerpPairs(),
    staleTime: PAIRS_STALE_MS,
    retry: retryUnlessUnavailable,
  });
  return {
    pairs: query.data ?? [],
    loading: query.isLoading,
    unavailable: query.isError && isPerpUnavailable(query.error),
    error: query.isError && !isPerpUnavailable(query.error) ? query.error : null,
    refetch: query.refetch,
  };
}

export function usePerpPrices(enabled: boolean) {
  const query = useQuery<PerpPrice[]>({
    queryKey: ["perp-prices"],
    queryFn: fetchPerpPrices,
    enabled,
    refetchInterval: PRICE_POLL_MS,
    staleTime: PRICE_POLL_MS,
    retry: retryUnlessUnavailable,
  });
  // Keyed by pair symbol for O(1) lookups from the pair list rows.
  const bySymbol = new Map<string, PerpPrice>();
  for (const p of query.data ?? []) bySymbol.set(p.pair, p);
  return { prices: bySymbol, loading: query.isLoading };
}

export function usePerpMarket(pair: string | null) {
  const query = useQuery<{ market: PerpPairMarket; closed: boolean }>({
    queryKey: ["perp-market", pair],
    // Staleness ("this market is likely closed") is judged here at fetch time,
    // not during render: the clock read is impure and this refreshes on the
    // same cadence as the data it judges.
    queryFn: async () => {
      const market = await fetchPerpMarket(pair as string);
      const closed =
        market.category != null &&
        isLikelyClosed(market.category, market.priceUpdatedAt ?? null, Date.now() / 1000);
      return { market, closed };
    },
    enabled: pair != null,
    refetchInterval: MARKET_POLL_MS,
    staleTime: MARKET_POLL_MS,
    retry: retryUnlessUnavailable,
  });
  return {
    market: query.data?.market ?? null,
    closed: query.data?.closed ?? false,
    loading: query.isLoading,
  };
}
