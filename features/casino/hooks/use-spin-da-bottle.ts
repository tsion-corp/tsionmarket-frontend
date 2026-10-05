"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARKADE_CAMPAIGN_QUERY_KEY } from "@/features/casino/lib/api/arkjet";
import {
  fetchSpinBalance,
  fetchSpinRules,
  playSpin,
  prepareSpin,
  SPIN_QUERY_KEYS,
  type SpinPick,
} from "@/features/casino/lib/api/spin";
import { useAuthSession } from "@/hooks/use-auth-session";
import { pollUnlessFailing } from "@/lib/query-poll";
import { useSignInPrompt } from "@/hooks/use-require-session";

const KEYS = {
  rules: ["casino", "spin-da-bottle", "rules"] as const,
  balance: SPIN_QUERY_KEYS.balance,
};

export function useSpinDaBottle() {
  const { ready, authenticated, evmAddress, profile } = useAuthSession();
  const login = useSignInPrompt("play");
  const queryClient = useQueryClient();
  const hasSession = ready && authenticated && Boolean(evmAddress);

  const rules = useQuery({
    queryKey: KEYS.rules,
    queryFn: fetchSpinRules,
    staleTime: 5 * 60_000,
  });
  const balance = useQuery({
    queryKey: [...KEYS.balance, evmAddress ?? null],
    queryFn: fetchSpinBalance,
    enabled: hasSession,
    refetchInterval: pollUnlessFailing(30_000),
    staleTime: 30_000,
    retry: false,
  });
  const spin = useMutation({
    mutationFn: async (input: { amount: string; currency: string; playerPick: SpinPick }) => {
      const prepared = await prepareSpin(crypto.randomUUID());
      return playSpin(prepared.wagerId, {
        ...input,
        clientSeed: `web-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSettled: () => {
      void Promise.all([queryClient.invalidateQueries({ queryKey: KEYS.balance })]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ARKADE_CAMPAIGN_QUERY_KEY });
    },
  });

  return {
    rules: rules.data ?? null,
    balance: hasSession ? (balance.data ?? null) : null,
    authenticated,
    authReady: ready,
    profile,
    login,
    play: spin.mutateAsync,
    pending: spin.isPending,
    loading: rules.isLoading || (hasSession && balance.isLoading),
    error: rules.error ?? balance.error ?? spin.error,
  };
}
