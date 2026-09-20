"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type ArkjetBet,
  type ArkjetBetList,
  type ArkjetRound,
  type CreateArkjetBetInput,
} from "@/features/casino/lib/api/arkjet";
import {
  ARKJET_SOCKET_CLOSED,
  ARKJET_SOCKET_READY,
  ARKJET_SOCKET_RESYNC,
  isArkjetBet,
  isArkjetRound,
  sendArkjetCommand,
  subscribeArkjetTopics,
} from "@/features/casino/lib/arkjet/live-socket";

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
  const [socketReady, setSocketReady] = useState(false);
  const hasSession = ready && authenticated && Boolean(user?.id);
  const current = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.current,
    queryFn: fetchArkjetCurrentRound,
    // WebSocket drives live play. This sparse read is authoritative repair if
    // the broker is unavailable while the gateway connection itself stays up.
    refetchInterval: pollUnlessFailing(socketReady ? 10_000 : 5_000),
    staleTime: 1_000,
  });
  const history = useQuery({
    ...READ_OPTIONS,
    queryKey: ARKJET_KEYS.history,
    queryFn: () => fetchArkjetRoundHistory(24),
    refetchInterval: socketReady ? false : pollUnlessFailing(60_000),
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
    refetchInterval: socketReady ? false : pollUnlessFailing(30_000),
    staleTime: 30_000,
  });
  const bets = useQuery({
    ...READ_OPTIONS,
    queryKey: [...ARKJET_KEYS.bets, user?.id ?? null],
    queryFn: fetchArkjetCurrentBets,
    enabled: hasSession,
    refetchInterval: socketReady
      ? false
      : (query) =>
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
    const changedWithoutTerminal =
      changedRound && previous.status !== "REVEALED" && previous.status !== "CANCELLED";
    if (!changedWithoutTerminal && !finished) return;
    // Refresh settlements immediately, with slow polling only as missed-transition repair.
    void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.history });
    if (hasSession) {
      void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance });
      void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.bets });
    }
  }, [current.data, hasSession, queryClient]);

  const applyBet = useCallback(
    (bet: ArkjetBet) => {
      void queryClient.cancelQueries({ queryKey: ARKJET_KEYS.bets });
      queryClient.setQueryData<ArkjetBetList>(
        [...ARKJET_KEYS.bets, user?.id ?? null],
        (existing) => {
          const items = existing?.items ?? [];
          if (bet.status !== "ACCEPTED") {
            return { items: items.filter((item) => item.betId !== bet.betId) };
          }
          return {
            items: [bet, ...items.filter((item) => item.betId !== bet.betId)],
          };
        }
      );
      void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance });
    },
    [queryClient, user?.id]
  );

  const synchronize = useCallback(async () => {
    const [roundResult, betsResult, balanceResult] = await Promise.allSettled([
      fetchArkjetCurrentRound(),
      hasSession ? fetchArkjetCurrentBets() : Promise.resolve(null),
      hasSession ? fetchArkjetBalance() : Promise.resolve(null),
    ]);
    if (roundResult.status === "fulfilled") {
      queryClient.setQueryData(ARKJET_KEYS.current, roundResult.value);
    }
    if (betsResult.status === "fulfilled" && betsResult.value) {
      queryClient.setQueryData([...ARKJET_KEYS.bets, user?.id ?? null], betsResult.value);
    }
    if (balanceResult.status === "fulfilled" && balanceResult.value) {
      queryClient.setQueryData([...ARKJET_KEYS.balance, user?.id ?? null], balanceResult.value);
    }
  }, [hasSession, queryClient, user?.id]);

  useEffect(() => {
    return subscribeArkjetTopics(hasSession ? (user?.id ?? null) : null, (frame) => {
      if (frame.type === ARKJET_SOCKET_READY.type) {
        setSocketReady(true);
        return;
      }
      if (frame.type === ARKJET_SOCKET_CLOSED.type) {
        setSocketReady(false);
        void synchronize();
        return;
      }
      if (frame.type === ARKJET_SOCKET_RESYNC.type) {
        void synchronize();
        return;
      }
      if (frame.type === "multiplier") {
        const update = frame.data as {
          roundId?: unknown;
          sequence?: unknown;
          multiplier?: unknown;
        } | null;
        if (typeof update?.roundId !== "string" || typeof update.multiplier !== "string") return;
        const roundId = update.roundId;
        const multiplier = update.multiplier;
        queryClient.setQueryData<ArkjetRound>(ARKJET_KEYS.current, (round) =>
          round?.roundId === roundId ? { ...round, currentMultiplier: multiplier } : round
        );
        return;
      }
      if (isArkjetRound(frame.data)) {
        void queryClient.cancelQueries({ queryKey: ARKJET_KEYS.current });
        queryClient.setQueryData(ARKJET_KEYS.current, frame.data);
        return;
      }
      if (isArkjetBet(frame.data)) applyBet(frame.data);
    });
  }, [applyBet, hasSession, queryClient, synchronize, user?.id]);

  const shouldFallBackToHttp = (error: unknown): boolean => {
    if (!error || typeof error !== "object" || !("code" in error)) return false;
    const code = (error as { code?: unknown }).code;
    return (
      code === "SOCKET_COMMANDS_UNAVAILABLE" ||
      code === "SOCKET_UNAVAILABLE" ||
      code === "SOCKET_COMMAND_TIMEOUT"
    );
  };
  const socketFirst = async <T>(socketAction: () => Promise<T>, httpAction: () => Promise<T>) => {
    try {
      return await socketAction();
    } catch (error) {
      if (!shouldFallBackToHttp(error)) throw error;
      return httpAction();
    }
  };
  const place = useMutation({
    mutationFn: (input: CreateArkjetBetInput) =>
      socketFirst(
        () =>
          sendArkjetCommand<ArkjetBet>({
            commandId: input.idempotencyKey,
            action: "placeBet",
            ...input,
          }),
        () => createArkjetBet(input)
      ),
    onSuccess: applyBet,
  });
  const cancel = useMutation({
    mutationFn: (betId: string) =>
      socketFirst(
        () =>
          sendArkjetCommand<ArkjetBet>({
            commandId: crypto.randomUUID(),
            action: "cancelBet",
            betId,
          }),
        () => cancelArkjetBet(betId)
      ),
    onSuccess: applyBet,
  });
  const cashout = useMutation({
    mutationFn: (betId: string) =>
      socketFirst(
        () =>
          sendArkjetCommand<ArkjetBet>({
            commandId: crypto.randomUUID(),
            action: "cashoutBet",
            betId,
          }),
        () => cashoutArkjetBet(betId)
      ),
    onSuccess: applyBet,
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
