"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDraughtsMarketOdds,
  fetchMyDraughtsBets,
  placeDraughtsBet,
} from "@/features/casino/lib/api/draughts-betting";
import type { PlaceBetInput } from "@/features/casino/lib/api/types";
import { track } from "@/lib/analytics/mixpanel";

const ODDS_POLL_MS = 6_000;

export const DRAUGHTS_BETTING_KEYS = {
  odds: (matchId: string) => ["casino", "draughts", "betting", "odds", matchId] as const,
  myBets: (matchId: string, bettor: string) =>
    ["casino", "draughts", "betting", "my-bets", matchId, bettor] as const,
};

export function useDraughtsMatchMarket(matchId: string | null, bettor: string | null) {
  const odds = useQuery({
    queryKey: DRAUGHTS_BETTING_KEYS.odds(matchId ?? "none"),
    queryFn: () => fetchDraughtsMarketOdds(matchId as string),
    enabled: !!matchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "settled" || status === "voided" ? false : ODDS_POLL_MS;
    },
  });

  const bets = useQuery({
    queryKey: DRAUGHTS_BETTING_KEYS.myBets(matchId ?? "none", bettor ?? "none"),
    queryFn: () => fetchMyDraughtsBets(matchId as string, bettor as string),
    enabled: !!matchId && !!bettor,
  });

  return {
    odds: odds.data,
    myBets: bets.data ?? [],
    isLoading: odds.isLoading,
    error: odds.error,
  };
}

export function usePlaceDraughtsBet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceBetInput) => placeDraughtsBet(input),
    onSuccess: (_slip, input) => {
      track("spectator_bet_placed", {
        game: "checkers",
        match_id: input.matchId,
        side: input.selection,
        amount_usd: Number(input.stakeUsdc),
      });
      void queryClient.invalidateQueries({
        queryKey: DRAUGHTS_BETTING_KEYS.odds(input.matchId),
      });
      void queryClient.invalidateQueries({
        queryKey: DRAUGHTS_BETTING_KEYS.myBets(input.matchId, input.bettor),
      });
      void queryClient.invalidateQueries({ queryKey: ["casino", "chess", "cashier"] });
    },
  });
}
