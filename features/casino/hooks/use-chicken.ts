"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARKJET_KEYS } from "@/features/casino/hooks/use-arkjet";
import { pollUnlessFailing } from "@/lib/query-poll";
import { track } from "@/lib/analytics/mixpanel";
import { GAME_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import { chickenReports } from "@/features/casino/lib/chicken-analytics";
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
import {
  CHICKEN_SOCKET_CLOSED,
  CHICKEN_SOCKET_RESYNC,
  isChickenSession,
  sendChickenCommand,
  subscribeChickenTopic,
} from "@/features/casino/lib/chicken/live-socket";

const KEYS = {
  rules: ["casino", "chicken", "rules"] as const,
  risk: ARKJET_KEYS.riskRules,
  active: ["casino", "chicken", "active"] as const,
  history: ["casino", "chicken", "history"] as const,
  balance: ARKJET_KEYS.balance,
};

function action(session: ChickenSession) {
  return {
    sessionId: session.sessionId,
    expectedVersion: session.version,
    idempotencyKey: crypto.randomUUID(),
  };
}

function shouldFallBackToHttp(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "SOCKET_COMMANDS_UNAVAILABLE" ||
    code === "SOCKET_UNAVAILABLE" ||
    code === "SOCKET_COMMAND_TIMEOUT"
  );
}

async function socketFirst<T>(socketAction: () => Promise<T>, httpAction: () => Promise<T>) {
  try {
    return await socketAction();
  } catch (error) {
    if (!shouldFallBackToHttp(error)) throw error;
    return httpAction();
  }
}

export function useChicken() {
  const { ready, authenticated, user, login } = usePrivy();
  const queryClient = useQueryClient();
  const [terminalResult, setTerminalResult] = useState<ChickenSession | null>(null);
  const hasSession = ready && authenticated && Boolean(user?.id);
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
    queryKey: [...KEYS.balance, user?.id ?? null],
    queryFn: fetchArkjetBalance,
    enabled: hasSession,
    refetchInterval: pollUnlessFailing(30_000),
    staleTime: 30_000,
    retry: false,
  });
  const history = useQuery({
    queryKey: KEYS.history,
    queryFn: () => fetchChickenHistory(12),
    enabled: hasSession,
    staleTime: 2_000,
  });

  // What has already been reported about a round. The session is cumulative
  // and arrives again on every socket frame and every resync, so without this
  // one lane crossed would be reported on each of them.
  const reported = useRef(new Set<string>());

  const settle = useCallback(
    (session: ChickenSession) => {
      for (const report of chickenReports(session)) {
        if (reported.current.has(report.key)) continue;
        reported.current.add(report.key);
        if (report.name === "chicken_round_started") track(report.name, report.props);
        else if (report.name === "chicken_lane_advanced") track(report.name, report.props);
        else if (report.name === "chicken_cashed_out") track(report.name, report.props);
        else track("chicken_round_lost", report.props);
      }
      void queryClient.cancelQueries({ queryKey: KEYS.active });
      queryClient.setQueryData(KEYS.active, session.status === "active" ? session : null);
      setTerminalResult(session.status === "active" ? null : session);
      if (session.status !== "active" || session.currentStep <= 1) {
        void queryClient.invalidateQueries({ queryKey: KEYS.balance });
      }
      if (session.status !== "active") {
        void queryClient.invalidateQueries({ queryKey: KEYS.history });
      }
    },
    [queryClient]
  );
  const synchronize = useCallback(async () => {
    const session = await fetchActiveChicken();
    queryClient.setQueryData(KEYS.active, session);
    if (session) setTerminalResult(null);
  }, [queryClient]);

  useEffect(() => {
    if (!hasSession || !user?.id) return;
    return subscribeChickenTopic(user.id, (frame) => {
      if (frame.type === CHICKEN_SOCKET_CLOSED.type || frame.type === CHICKEN_SOCKET_RESYNC.type) {
        void synchronize();
        return;
      }
      if (!isChickenSession(frame.data)) return;
      const session = frame.data;
      const current = queryClient.getQueryData<ChickenSession | null>(KEYS.active);
      if (current?.sessionId === session.sessionId && current.version > session.version) {
        return;
      }
      settle(session);
    });
  }, [hasSession, queryClient, settle, synchronize, user?.id]);

  const runAction = (
    kind: "step" | "cashout",
    session: ChickenSession
  ): Promise<ChickenSession> => {
    const input = action(session);
    return socketFirst(
      () =>
        sendChickenCommand<ChickenSession>({
          commandId: input.idempotencyKey,
          action: kind,
          ...input,
        }),
      () => (kind === "step" ? stepChicken(input) : cashoutChicken(input))
    );
  };

  const start = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: async (input: {
      amount: string;
      currency: string;
      difficulty: ChickenDifficulty;
    }) => {
      const startInput = {
        ...input,
        clientSeed: `web-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      };
      const started = await socketFirst(
        () =>
          sendChickenCommand<ChickenSession>({
            commandId: startInput.idempotencyKey,
            action: "start",
            ...startInput,
          }),
        () => startChicken(startInput)
      );

      // Pilot Chicken starts the round and immediately requests the first crossing.
      return started.status === "active" && started.currentStep === 0
        ? runAction("step", started)
        : started;
    },
    onSuccess: settle,
    onError: (error, input) => {
      track("chicken_round_failed", {
        ...(Number.isFinite(Number(input.amount)) ? { amount_usd: Number(input.amount) } : {}),
        difficulty: input.difficulty,
        ...reasonFor(GAME_FAILURE, error),
      });
      void Promise.all([synchronize(), queryClient.invalidateQueries({ queryKey: KEYS.balance })]);
    },
  });
  const step = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: (session: ChickenSession) => runAction("step", session),
    onSuccess: settle,
    onError: synchronize,
  });
  const cashout = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: KEYS.active }),
    mutationFn: (session: ChickenSession) => runAction("cashout", session),
    onSuccess: settle,
    onError: synchronize,
  });

  return {
    rules: rules.data ?? null,
    risk: risk.data ?? null,
    session: active.data ?? terminalResult,
    balance: hasSession ? (balance.data ?? null) : null,
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
