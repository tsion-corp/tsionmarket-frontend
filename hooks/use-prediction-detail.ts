"use client";

import { useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getActivity,
  getGroup,
  getGroupChart,
  getHolders,
  getQuote,
  listComments,
  listGroups,
} from "@/lib/prediction/api";
import type { ChartInterval, Side } from "@/lib/prediction/types";

// TanStack Query hooks for the Polymarket-style market/event detail surfaces:
// top holders, the activity feed, comments, the CPMM quote, and multi-outcome
// events. Query keys stay under the shared ["prediction", ...] namespace so a
// broad invalidate (after a trade) refreshes them together. WS overlays live
// ticks; these intervals are relaxed fallbacks.

export function useTopHolders(marketId: string | null, side: Side, limit = 20) {
  return useQuery({
    queryKey: ["prediction", "holders", marketId, side, limit],
    queryFn: () => getHolders(marketId as string, side, limit),
    enabled: !!marketId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// Cursor-paginated activity feed. Pages are flattened by the caller.
export function useActivity(marketId: string | null, limit = 30) {
  return useInfiniteQuery({
    queryKey: ["prediction", "activity", marketId, limit],
    queryFn: ({ pageParam }) => getActivity(marketId as string, pageParam, limit),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!marketId,
    staleTime: 10_000,
  });
}

export function useComments(scope: { groupId?: string; marketId?: string }, limit = 50) {
  const id = scope.groupId ?? scope.marketId ?? null;
  return useQuery({
    queryKey: ["prediction", "comments", scope.groupId ? "group" : "market", id, limit],
    queryFn: () => listComments(scope, limit),
    enabled: !!id,
    staleTime: 10_000,
  });
}

// A size-aware CPMM quote, refetched as the user changes side/amount. Disabled
// for a zero amount so we don't spam the endpoint while the input is empty.
export function useQuote(
  marketId: string | null,
  side: Side,
  kind: "buy" | "sell",
  amount: bigint
) {
  return useQuery({
    queryKey: ["prediction", "quote", marketId, side, kind, amount.toString()],
    queryFn: () => getQuote(marketId as string, side, kind, amount),
    enabled: !!marketId && amount > 0n,
    staleTime: 5_000,
  });
}

export function useGroup(idOrSlug: string | null) {
  return useQuery({
    queryKey: ["prediction", "group", idOrSlug],
    queryFn: () => getGroup(idOrSlug as string),
    enabled: !!idOrSlug,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

// Multi-series event chart (one line per outcome). Interval-driven like the
// single-market chart.
export function useGroupChart(idOrSlug: string | null, interval: ChartInterval) {
  return useQuery({
    queryKey: ["prediction", "group-chart", idOrSlug, interval],
    queryFn: () => getGroupChart(idOrSlug as string, interval),
    enabled: !!idOrSlug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGroups(filter?: { category?: string; status?: string }) {
  return useQuery({
    queryKey: ["prediction", "groups", filter?.category ?? null, filter?.status ?? null],
    queryFn: () => listGroups(filter),
    staleTime: 15_000,
  });
}

// Invalidate every detail surface for a market after a write (trade/comment).
export function useInvalidatePredictionDetail() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["prediction"] });
  }, [qc]);
}
