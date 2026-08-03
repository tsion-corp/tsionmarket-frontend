"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarketOdds, fetchMyBets, placeBet } from "@/lib/casino/api/betting";
import type { PlaceBetInput } from "@/lib/casino/api/types";

// Pari-mutuel odds move as money enters the pools, so they are polled while a
// spectator watches. The match already streams over the socket, so this stays
// gentle to spare the gateway's per-IP budget.
const ODDS_POLL_MS = 6_000;

export const BETTING_KEYS = {
  odds: (matchId: string) => ["casino", "betting", "odds", matchId] as const,
  myBets: (matchId: string, bettor: string) =>
    ["casino", "betting", "my-bets", matchId, bettor] as const,
};

// The live market for one match: current pools and prices, plus the caller's
// own bets when a wallet is connected.
export function useMatchMarket(matchId: string | null, bettor: string | null) {
  const odds = useQuery({
    queryKey: BETTING_KEYS.odds(matchId ?? "none"),
    queryFn: () => fetchMarketOdds(matchId as string),
    enabled: !!matchId,
    // A settled or voided market is final — stop polling it. Without this the
    // odds keep polling a finished match forever, and the backend's transient
    // 500 while it settles the market turns into an endless retry storm.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === "settled" || status === "voided") return false;
      return ODDS_POLL_MS;
    },
  });

  const bets = useQuery({
    queryKey: BETTING_KEYS.myBets(matchId ?? "none", bettor ?? "none"),
    queryFn: () => fetchMyBets(matchId as string, bettor as string),
    enabled: !!matchId && !!bettor,
  });

  return {
    odds: odds.data,
    myBets: bets.data ?? [],
    isLoading: odds.isLoading,
    error: odds.error,
  };
}

// Places a spectator bet. The service reserves the stake from the cashier
// balance, so on success the market, the caller's bets, and the cashier balance
// are all refreshed to agree.
export function usePlaceBet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceBetInput) => placeBet(input),
    onSuccess: (_slip, input) => {
      void queryClient.invalidateQueries({ queryKey: BETTING_KEYS.odds(input.matchId) });
      void queryClient.invalidateQueries({
        queryKey: BETTING_KEYS.myBets(input.matchId, input.bettor),
      });
      // The stake left the cashier balance; keep the wallet display honest.
      void queryClient.invalidateQueries({ queryKey: ["casino", "chess", "cashier"] });
    },
  });
}
