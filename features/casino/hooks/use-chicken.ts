"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cashoutChicken,
  fetchActiveChicken,
  fetchArkjetBalance,
  fetchArkjetRiskRules,
  fetchChickenHistory,
  fetchChickenRules,
  startChicken,
  stepChicken,
  type ChickenDifficulty,
  type ChickenSession,
} from "@/features/casino/lib/api/arkjet";

const KEYS = {
  rules: ["casino", "chicken", "rules"] as const,
  risk: ["casino", "arkjet", "risk", "rules"] as const,
  active: ["casino", "chicken", "active"] as const,
  history: ["casino", "chicken", "history"] as const,
  balance: ["casino", "arkjet", "balance"] as const,
};

function action(session: ChickenSession) {
  return {
    sessionId: session.sessionId,
    expectedVersion: session.version,
    idempotencyKey: crypto.randomUUID(),
  };
}

export function useChicken() {
  const { ready, authenticated, login } = usePrivy();
  const queryClient = useQueryClient();
  const [terminalResult, setTerminalResult] = useState<ChickenSession | null>(null);
  const hasSession = ready && authenticated;
  const rules = useQuery({
    queryKey: KEYS.rules,
    queryFn: fetchChickenRules,
    staleTime: 5 * 60_000,
  });
  const risk = useQuery({
    queryKey: KEYS.risk,
    queryFn: fetchArkjetRiskRules,
    staleTime: 5 * 60_000,
  });
  const active = useQuery({
    queryKey: KEYS.active,
    queryFn: fetchActiveChicken,
    enabled: hasSession,
    staleTime: 250,
    refetchOnWindowFocus: false,
  });
  const balance = useQuery({
    queryKey: KEYS.balance,
    queryFn: fetchArkjetBalance,
    enabled: hasSession,
    refetchInterval: hasSession ? 2_000 : false,
    staleTime: 500,
  });
  const history = useQuery({
    queryKey: KEYS.history,
    queryFn: () => fetchChickenHistory(12),
    enabled: hasSession,
    staleTime: 2_000,
  });

  const settle = async (session: ChickenSession) => {
    await queryClient.cancelQueries({ queryKey: KEYS.active });
    queryClient.setQueryData(KEYS.active, session.status === "active" ? session : null);
    setTerminalResult(session.status === "active" ? null : session);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.balance }),
      queryClient.invalidateQueries({ queryKey: KEYS.history }),
    ]);
  };
  const synchronize = async () => {
    const session = await fetchActiveChicken();
    queryClient.setQueryData(KEYS.active, session);
    if (session) setTerminalResult(null);
  };
  const start = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: async (input: {
      amount: string;
      currency: string;
      difficulty: ChickenDifficulty;
    }) => {
      const started = await startChicken({
        ...input,
        clientSeed: `web-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      // Pilot Chicken starts the round and immediately requests the first crossing.
      return started.status === "active" && started.currentStep === 0
        ? stepChicken(action(started))
        : started;
    },
    onSuccess: settle,
    onError: () => {
      void Promise.all([synchronize(), queryClient.invalidateQueries({ queryKey: KEYS.balance })]);
    },
  });
  const step = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: (session: ChickenSession) => stepChicken(action(session)),
    onSuccess: settle,
    onError: synchronize,
  });
  const cashout = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: (session: ChickenSession) => cashoutChicken(action(session)),
    onSuccess: settle,
    onError: synchronize,
  });

  return {
    rules: rules.data ?? null,
    risk: risk.data ?? null,
    session: active.data ?? terminalResult,
    balance: balance.data ?? null,
    history: history.data?.items ?? [],
    authenticated,
    authReady: ready,
    login,
    start: start.mutateAsync,
    step: step.mutateAsync,
    cashout: cashout.mutateAsync,
    pending: start.isPending || step.isPending || cashout.isPending,
    loading: rules.isLoading || (hasSession && active.isLoading),
    error: rules.error ?? risk.error ?? active.error ?? start.error ?? step.error ?? cashout.error,
  };
}
