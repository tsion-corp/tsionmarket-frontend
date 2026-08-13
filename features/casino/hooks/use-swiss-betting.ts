"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CASHIER_KEYS } from "@/features/casino/hooks/use-chess-cashier";
import {
  fetchSwissBets,
  fetchSwissMarketOdds,
  placeSwissBet,
} from "@/features/casino/lib/api/swiss-betting";

const SWISS_ODDS_POLL_MS = 6_000;

export const SWISS_BETTING_KEYS = {
  odds: (swissId: string) => ["casino", "chess", "swiss-betting", "odds", swissId] as const,
  bets: (swissId: string, bettor: string) =>
    ["casino", "chess", "swiss-betting", "bets", swissId, bettor] as const,
};

export function useSwissMarket(swissId: string) {
  const queryClient = useQueryClient();
  const { ready, authenticated } = usePrivy();
  const wallet = useCasinoWallet();
  const bettor = wallet.address;

  const odds = useQuery({
    queryKey: SWISS_BETTING_KEYS.odds(swissId),
    queryFn: () => fetchSwissMarketOdds(swissId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "settled" || status === "voided" || status === "closed"
        ? false
        : SWISS_ODDS_POLL_MS;
    },
  });
  const bets = useQuery({
    queryKey: SWISS_BETTING_KEYS.bets(swissId, bettor ?? "none"),
    queryFn: () => fetchSwissBets(swissId, bettor as string),
    enabled: ready && authenticated && !!bettor,
    retry: false,
  });
  const place = useMutation({
    mutationFn: (input: {
      predictedPlayerId: string;
      stakeUsdc: string;
      idempotencyKey: string;
    }) => {
      if (!bettor) throw new Error("Connect your wallet to place a bet.");
      return placeSwissBet({ swissId, bettor, ...input });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SWISS_BETTING_KEYS.odds(swissId) });
      if (bettor) {
        void queryClient.invalidateQueries({
          queryKey: SWISS_BETTING_KEYS.bets(swissId, bettor),
        });
        void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(bettor) });
      }
    },
  });

  return {
    odds: odds.data ?? null,
    bets: bets.data ?? [],
    isLoading: odds.isLoading,
    error: odds.error,
    placeBet: place.mutateAsync,
    placingBet: place.isPending,
  };
}
