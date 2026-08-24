"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarketOdds, fetchMyBets, placeBet } from "@/features/casino/lib/api/betting";
import type { PlaceBetInput } from "@/features/casino/lib/api/types";
import { CASHIER_KEYS } from "@/features/casino/hooks/use-chess-cashier";
import { track } from "@/lib/analytics/mixpanel";

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
  const queryClient = useQueryClient();
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

  const marketStatus = odds.data?.status;
  useEffect(() => {
    if (!matchId || !bettor || (marketStatus !== "settled" && marketStatus !== "voided")) {
      return;
    }

    // Market status, bet rows, and cashier credits commit atomically. As soon
    // as the public market reports a final status, refresh both private views
    // so the spectator sees the return without reloading or waiting for focus.
    void queryClient.invalidateQueries({ queryKey: BETTING_KEYS.myBets(matchId, bettor) });
    void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(bettor) });
  }, [bettor, marketStatus, matchId, queryClient]);

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
      // Spectator stakes are placed from both game surfaces; the market is
      // keyed by match, which is what identifies the game being watched.
      track("spectator_bet_placed", {
        game: "chess",
        match_id: input.matchId,
        side: input.selection,
        amount_usd: Number(input.stakeUsdc),
      });
      void queryClient.invalidateQueries({ queryKey: BETTING_KEYS.odds(input.matchId) });
      void queryClient.invalidateQueries({
        queryKey: BETTING_KEYS.myBets(input.matchId, input.bettor),
      });
      // The stake left the cashier balance; keep the wallet display honest.
      void queryClient.invalidateQueries({ queryKey: ["casino", "chess", "cashier"] });
    },
  });
}
