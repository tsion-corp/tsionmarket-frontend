"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  createLotteryQuickPick,
  fetchCurrentLotteryDraw,
  fetchLotteryConfig,
  fetchLotteryEligibility,
  fetchLotteryResults,
  fetchLotteryTickets,
  purchaseLotteryTicket,
  type LotterySelection,
} from "@/features/casino/lib/api/lottery";
import { fetchChessBalance } from "@/features/casino/lib/api/cashier";
import { CASHIER_KEYS } from "@/features/casino/hooks/use-chess-cashier";
import { errorCode } from "@/lib/api/envelope";
import { getWalletAddress } from "@/lib/user";

export const LOTTERY_KEYS = {
  config: ["casino", "lottery", "config"] as const,
  currentDraw: ["casino", "lottery", "draw", "current"] as const,
  results: ["casino", "lottery", "results"] as const,
  tickets: (wallet: string) => ["casino", "lottery", "tickets", wallet] as const,
  eligibility: (wallet: string) => ["casino", "lottery", "eligibility", wallet] as const,
};

const TERMINAL_AUTH_ERRORS = new Set(["UNAUTHORIZED", "NO_WALLET"]);

function retryPrivateRead(failureCount: number, error: unknown): boolean {
  return !TERMINAL_AUTH_ERRORS.has(errorCode(error) ?? "") && failureCount < 3;
}

export interface LotteryPurchaseRequest {
  selection: LotterySelection;
  idempotencyKey: string;
}

export function useLottery() {
  const queryClient = useQueryClient();
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");
  const privateReadsEnabled = ready && authenticated && !!wallet;

  const config = useQuery({
    queryKey: LOTTERY_KEYS.config,
    queryFn: fetchLotteryConfig,
    staleTime: 5 * 60_000,
  });
  const currentDraw = useQuery({
    queryKey: LOTTERY_KEYS.currentDraw,
    queryFn: fetchCurrentLotteryDraw,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
  const results = useQuery({
    queryKey: LOTTERY_KEYS.results,
    queryFn: () => fetchLotteryResults(8),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const tickets = useQuery({
    queryKey: LOTTERY_KEYS.tickets(wallet ?? "none"),
    queryFn: () => fetchLotteryTickets(wallet as string),
    enabled: privateReadsEnabled,
    retry: retryPrivateRead,
    refetchInterval: 15_000,
  });
  const eligibility = useQuery({
    queryKey: LOTTERY_KEYS.eligibility(wallet ?? "none"),
    queryFn: () => fetchLotteryEligibility(wallet as string),
    enabled: privateReadsEnabled,
    retry: retryPrivateRead,
    staleTime: 30_000,
  });
  const balance = useQuery({
    queryKey: CASHIER_KEYS.balance(wallet ?? "none"),
    queryFn: () => fetchChessBalance(wallet as string),
    enabled: privateReadsEnabled,
    retry: retryPrivateRead,
    refetchInterval: 15_000,
  });

  const quickPick = useMutation({
    mutationFn: async () => {
      if (!currentDraw.data) throw new Error("The next draw is not ready yet.");
      const selections = await createLotteryQuickPick(currentDraw.data.id, 1);
      const selection = selections[0];
      if (!selection) throw new Error("Quick Pick did not return a ticket.");
      return selection;
    },
  });

  const purchase = useMutation({
    mutationFn: ({ selection, idempotencyKey }: LotteryPurchaseRequest) => {
      if (!wallet) throw new Error("Connect your wallet first.");
      if (!currentDraw.data) throw new Error("The next draw is not ready yet.");
      return purchaseLotteryTicket(currentDraw.data.id, {
        player: wallet,
        whiteNumbers: selection.whiteNumbers,
        powerNumber: selection.powerNumber,
        idempotencyKey,
      });
    },
    onSuccess: async () => {
      if (!wallet) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.currentDraw }),
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.tickets(wallet) }),
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.eligibility(wallet) }),
        queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet) }),
      ]);
    },
  });

  return {
    wallet,
    config: config.data ?? null,
    currentDraw: currentDraw.data ?? null,
    results: results.data ?? [],
    tickets: tickets.data ?? [],
    eligibility: eligibility.data ?? null,
    availableUsdc: balance.data?.availableUsdc ?? "0",
    lockedUsdc: balance.data?.lockedUsdc ?? "0",
    loading: config.isLoading || currentDraw.isLoading,
    error: config.error ?? currentDraw.error,
    ticketsLoading: privateReadsEnabled && tickets.isLoading,
    quickPick: quickPick.mutateAsync,
    quickPicking: quickPick.isPending,
    purchase: purchase.mutateAsync,
    purchasing: purchase.isPending,
  };
}
