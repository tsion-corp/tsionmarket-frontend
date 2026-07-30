"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  claimDrawPrize,
  createEntries,
  fetchCurrentRound,
  fetchMyEntries,
  fetchPastResults,
} from "@/lib/casino/api/draw";
import type { CreateDrawEntryInput } from "@/lib/casino/api/types";

// The round only changes when it closes or settles, so it refreshes slowly;
// the countdown ticks locally off closesAt.
const ROUND_POLL_MS = 30_000;

export const DRAW_KEYS = {
  round: ["casino", "draw", "round"] as const,
  results: ["casino", "draw", "results"] as const,
  myEntries: ["casino", "draw", "my-entries"] as const,
};

export function useDrawRound() {
  const round = useQuery({
    queryKey: DRAW_KEYS.round,
    queryFn: fetchCurrentRound,
    refetchInterval: ROUND_POLL_MS,
  });
  const results = useQuery({
    queryKey: DRAW_KEYS.results,
    queryFn: () => fetchPastResults(),
  });

  return {
    round: round.data,
    pastResults: results.data ?? [],
    isLoading: round.isLoading,
    error: round.error,
  };
}

export function useMyDrawEntries() {
  const query = useQuery({
    queryKey: DRAW_KEYS.myEntries,
    queryFn: fetchMyEntries,
  });
  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Buys entries for the open round. The server charges the caller's balance,
// so the portfolio is refreshed alongside the entry list.
export function useBuyDrawEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDrawEntryInput) => createEntries(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DRAW_KEYS.myEntries });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

export function useClaimDrawPrize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => claimDrawPrize(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DRAW_KEYS.myEntries });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
