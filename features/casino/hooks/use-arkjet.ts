"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pollUnlessFailing } from "@/lib/query-poll";
import {
  cancelArkjetBet,
  cashoutArkjetBet,
  createArkjetBet,
  fetchArkjetBalance,
  fetchArkjetCapabilities,
  fetchArkjetCurrentBets,
  fetchArkjetCurrentRound,
  fetchArkjetFairnessRules,
  fetchArkjetRiskRules,
  fetchArkjetRoundHistory,
} from "@/features/casino/lib/api/arkjet";

export const ARKJET_KEYS = {
  current: ["casino", "arkjet", "round", "current"] as const,
  history: ["casino", "arkjet", "rounds", "history"] as const,
  capabilities: ["casino", "arkjet", "capabilities"] as const,
  rules: ["casino", "arkjet", "fairness", "rules"] as const,
  riskRules: ["casino", "arkjet", "risk", "rules", "usdc-v1"] as const,
  funding: ["casino", "arkjet", "funding", "config", "usdc-v1"] as const,
  balance: ["casino", "arkjet", "balance", "usdc-v1"] as const,
  bets: ["casino", "arkjet", "bets", "current", "usdc-v1"] as const,
};

const READ_OPTIONS = {
  retry: false,
  retryOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchIntervalInBackground: false,
} as const;

export function useArkjet() {
  const { ready, authenticated, user, login } = usePrivy();
  const queryClient = useQueryClient();
  const hasSession = ready && authenticated && Boolean(user?.id);
  const current = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.current,
    queryFn: fetchArkjetCurrentRound,
    refetchInterval: pollUnlessFailing(1_000),
    staleTime: 1_000,
  });
  const history = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.history,
    queryFn: () => fetchArkjetRoundHistory(24),
    refetchInterval: pollUnlessFailing(60_000),
    staleTime: 60_000,
  });
  const capabilities = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.capabilities,
    queryFn: fetchArkjetCapabilities,
    refetchInterval: pollUnlessFailing(5 * 60_000),
    staleTime: 5 * 60_000,
  });
  const rules = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.rules,
    queryFn: fetchArkjetFairnessRules,
    staleTime: 5 * 60_000,
    refetchInterval: pollUnlessFailing(5 * 60_000),
  });
  const riskRules = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.riskRules,
    queryFn: fetchArkjetRiskRules,
    staleTime: 5 * 60_000,
    refetchInterval: pollUnlessFailing(5 * 60_000),
  });
  const balance = useQuery({
    ...READ_OPTIONS,
    queryKey: [...ARKJET_KEYS.balance, user?.id ?? null],
    queryFn: fetchArkjetBalance,
    enabled: hasSession,
    refetchInterval: pollUnlessFailing(30_000),
    staleTime: 30_000,
  });
  const bets = useQuery({
    ...READ_OPTIONS,
    queryKey: [...ARKJET_KEYS.bets, user?.id ?? null],
    queryFn: fetchArkjetCurrentBets,
    enabled: hasSession,
    refetchInterval: (query) =>
      pollUnlessFailing(
        query.state.data?.items.some((bet) => bet.status === "ACCEPTED") ? 2_000 : 30_000
      )(query),
    staleTime: 2_000,
  });

  const previousRound = useRef<{ roundId: string; status: string } | null>(null);
  useEffect(() => {
    const round = current.data;
    if (!round) return;
    const previous = previousRound.current;
    previousRound.current = { roundId: round.roundId, status: round.status };
    if (!previous) return;
    const changedRound = previous.roundId !== round.roundId;
    const finished =
      previous.status !== round.status &&
      (round.status === "REVEALED" || round.status === "CANCELLED");
    if (!changedRound && !finished) return;
    // Refresh settlements immediately, with slow polling only as missed-transition repair.
    void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.history });
    if (hasSession) {
      void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance });
      void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.bets });
    }
  }, [current.data, hasSession, queryClient]);

  const refreshWagering = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance }),
      queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.bets }),
    ]);
  };
  const place = useMutation({
    mutationFn: createArkjetBet,
    onSuccess: refreshWagering,
  });
  const cancel = useMutation({
    mutationFn: cancelArkjetBet,
    onSuccess: refreshWagering,
  });
  const cashout = useMutation({
    mutationFn: cashoutArkjetBet,
    onSuccess: refreshWagering,
  });

  return {
    current: current.data ?? null,
    history: history.data?.items ?? [],
    capabilities: capabilities.data ?? null,
    rules: rules.data ?? null,
    riskRules: riskRules.data ?? null,
    balance: hasSession ? (balance.data ?? null) : null,
    bets: hasSession ? (bets.data?.items ?? []) : [],
    authReady: ready,
    authenticated,
    login,
    placeBet: place.mutateAsync,
    cancelBet: cancel.mutateAsync,
    cashoutBet: cashout.mutateAsync,
    wagerPending: place.isPending || cancel.isPending || cashout.isPending,
    loading: current.isLoading,
    error: current.error,
    refresh: () => current.refetch(),
  };
}
