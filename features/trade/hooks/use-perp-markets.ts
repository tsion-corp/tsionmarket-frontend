"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPerpMarket,
  fetchPerpPairs,
  fetchPerpPrices,
  isPerpUnavailable,
  perpErrorCode,
} from "@/lib/perp/api";
import { isLikelyClosed } from "@/lib/perp/logic";
import { pollUnlessFailing } from "@/lib/query-poll";
import type { PerpPair, PerpPairMarket, PerpPrice } from "@/lib/perp/types";

// Market data hooks for the perp section. Pair config barely changes, so it is
// fetched once and kept; prices and per-market metrics poll every few seconds
// (the doc's guidance to avoid RPC 429s: a sane interval, never a tight loop).
// All three report `unavailable` distinctly from a transient error, so the UI
// can show its preview state while the gateway is not deployed yet without
// hiding real failures behind it.

const PRICE_POLL_MS = 5_000;
// When the WebSocket stream is delivering (see use-perp-price-stream), REST
// becomes the first-paint seed and a safety net, per the gateway's "do not
// poll for live updates" guidance — so it drops to a slow background cadence.
const PRICE_POLL_SLOW_MS = 30_000;
const MARKET_POLL_MS = 5_000;
const PAIRS_STALE_MS = 5 * 60 * 1000;

// Not-deployed is terminal for the session: retrying cannot fix it, so stop
// after the first response instead of hammering the proxy. NOT_FOUND is
// terminal for the same reason. The gateway has answered about this exact
// pair, and asking twice more changes nothing.
export function retryUnlessUnavailable(failureCount: number, error: unknown): boolean {
  if (isPerpUnavailable(error)) return false;
  if (perpErrorCode(error) === "NOT_FOUND") return false;
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

// `slow` picks the background cadence: the desk passes it while its socket is
// delivering, the dashboard brief passes it always, because a four-row teaser
// does not need a mark every five seconds. One query key serves both, and
// React Query polls at the fastest interval any mounted caller asked for, so
// the desk still gets its five seconds whenever it is open.
//
// `subscribed` detaches this caller without parking the query: the last data
// stays on screen and `refetch()` still works, which `enabled: false` would
// not allow. The brief passes its section's visibility, so a perps teaser
// scrolled off the bottom of the dashboard stops asking. Before this it was
// the one brief that kept polling out of view, at 5s, and was 40% of all the
// requests an idle dashboard made.
export function usePerpPrices(enabled: boolean, slow = false, subscribed = true) {
  const pollMs = slow ? PRICE_POLL_SLOW_MS : PRICE_POLL_MS;
  const query = useQuery<PerpPrice[]>({
    queryKey: ["perp-prices"],
    queryFn: fetchPerpPrices,
    enabled,
    subscribed,
    refetchInterval: pollUnlessFailing(pollMs),
    staleTime: pollMs,
    retry: retryUnlessUnavailable,
  });
  // Keyed by pair symbol; memoized so priceOf keeps a stable identity.
  const data = query.data;
  const bySymbol = useMemo(() => {
    const m = new Map<string, PerpPrice>();
    for (const p of data ?? []) m.set(p.pair, p);
    return m;
  }, [data]);
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
    refetchInterval: pollUnlessFailing(MARKET_POLL_MS),
    staleTime: MARKET_POLL_MS,
    retry: retryUnlessUnavailable,
  });
  return {
    market: query.data?.market ?? null,
    closed: query.data?.closed ?? false,
    loading: query.isLoading,
  };
}
