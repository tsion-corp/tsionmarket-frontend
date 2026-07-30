"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarketOdds, fetchMyBets, fetchOddsHistory, placeBet } from "@/lib/casino/api/betting";
import type { PlaceBetInput } from "@/lib/casino/api/types";

// Odds are priced by the server and move with the game, so they are polled
// briskly. History moves with them but is cheaper to refresh slowly.
const ODDS_POLL_MS = 3_000;
const HISTORY_POLL_MS = 15_000;

export const BETTING_KEYS = {
  odds: (matchId: string) => ["casino", "betting", "odds", matchId] as const,
  history: (matchId: string) => ["casino", "betting", "history", matchId] as const,
  myBets: (matchId?: string) => ["casino", "betting", "my-bets", matchId ?? "all"] as const,
};

// The live market for one match: current prices, how they have moved, and the
// caller's own bets on it.
export function useMatchMarket(matchId: string | null) {
  const odds = useQuery({
    queryKey: BETTING_KEYS.odds(matchId ?? "none"),
    queryFn: () => fetchMarketOdds(matchId as string),
    enabled: !!matchId,
    refetchInterval: ODDS_POLL_MS,
  });

  const history = useQuery({
    queryKey: BETTING_KEYS.history(matchId ?? "none"),
    queryFn: () => fetchOddsHistory(matchId as string),
    enabled: !!matchId,
    refetchInterval: HISTORY_POLL_MS,
  });

  const bets = useQuery({
    queryKey: BETTING_KEYS.myBets(matchId ?? undefined),
    queryFn: () => fetchMyBets(matchId as string),
    enabled: !!matchId,
  });

  return {
    odds: odds.data,
    history: history.data ?? [],
    myBets: bets.data ?? [],
    isLoading: odds.isLoading,
    error: odds.error,
  };
}

// Places a spectator bet. The server prices and escrows it; on success the
// caller's bets and balance are refreshed so the slip and the wallet agree.
export function usePlaceBet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceBetInput) => placeBet(input),
    onSuccess: (slip) => {
      void queryClient.invalidateQueries({ queryKey: BETTING_KEYS.myBets(slip.matchId) });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
