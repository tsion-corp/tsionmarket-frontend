"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ARKJET_KEYS } from "@/features/casino/hooks/use-arkjet";
import { ARKADE_CAMPAIGN_QUERY_KEY, fetchArkjetBalance } from "@/features/casino/lib/api/arkjet";
import {
  fetchSpinRules,
  playSpin,
  prepareSpin,
  type SpinPick,
} from "@/features/casino/lib/api/spin";
import { useAuthSession } from "@/hooks/use-auth-session";
import { pollUnlessFailing } from "@/lib/query-poll";

const KEYS = {
  rules: ["casino", "spin-da-bottle", "rules"] as const,
  balance: ARKJET_KEYS.balance,
};

export function useSpinDaBottle() {
  const { ready, authenticated, evmAddress, profile } = useAuthSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasSession = ready && authenticated && Boolean(evmAddress);

  const rules = useQuery({
    queryKey: KEYS.rules,
    queryFn: fetchSpinRules,
    staleTime: 5 * 60_000,
  });
  const balance = useQuery({
    queryKey: [...KEYS.balance, evmAddress ?? null],
    queryFn: fetchArkjetBalance,
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
    login: () => router.push("/auth"),
    play: spin.mutateAsync,
    pending: spin.isPending,
    loading: rules.isLoading || (hasSession && balance.isLoading),
    error: rules.error ?? balance.error ?? spin.error,
  };
}
