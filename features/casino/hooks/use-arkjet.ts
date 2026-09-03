"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  riskRules: ["casino", "arkjet", "risk", "rules"] as const,
  funding: ["casino", "arkjet", "funding", "config"] as const,
  balance: ["casino", "arkjet", "balance"] as const,
  bets: ["casino", "arkjet", "bets", "current"] as const,
};

export function useArkjet() {
  const { ready, authenticated, login } = usePrivy();
  const queryClient = useQueryClient();
  const hasSession = ready && authenticated;
  const current = useQuery({
    queryKey: ARKJET_KEYS.current,
    queryFn: fetchArkjetCurrentRound,
    refetchInterval: 250,
    staleTime: 100,
    retry: 2,
  });
  const history = useQuery({
    queryKey: ARKJET_KEYS.history,
    queryFn: () => fetchArkjetRoundHistory(24),
    refetchInterval: 2_000,
    staleTime: 1_000,
  });
  const capabilities = useQuery({
    queryKey: ARKJET_KEYS.capabilities,
    queryFn: fetchArkjetCapabilities,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const rules = useQuery({
    queryKey: ARKJET_KEYS.rules,
    queryFn: fetchArkjetFairnessRules,
    staleTime: 5 * 60_000,
  });
  const riskRules = useQuery({
    queryKey: ARKJET_KEYS.riskRules,
    queryFn: fetchArkjetRiskRules,
    staleTime: 5 * 60_000,
  });
  const balance = useQuery({
    queryKey: ARKJET_KEYS.balance,
    queryFn: fetchArkjetBalance,
    enabled: hasSession,
    refetchInterval: hasSession ? 2_000 : false,
    staleTime: 500,
    retry: 2,
  });
  const bets = useQuery({
    queryKey: ARKJET_KEYS.bets,
    queryFn: fetchArkjetCurrentBets,
    enabled: hasSession,
    refetchInterval: hasSession ? 500 : false,
    staleTime: 200,
    retry: 2,
  });

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
    balance: balance.data ?? null,
    bets: bets.data?.items ?? [],
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
