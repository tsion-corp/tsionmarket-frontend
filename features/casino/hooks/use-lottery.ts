"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  createLotteryQuickPick,
  fetchCurrentLotteryDraw,
  fetchLotteryConfig,
  fetchLotteryEligibility,
  fetchLotteryResults,
  fetchLotteryTickets,
  type LotterySelection,
} from "@/features/casino/lib/api/lottery";
import { useLotteryFunding } from "./use-lottery-funding";
import { errorCode } from "@/lib/api/envelope";
import { lotterySelectionKey } from "@/features/casino/lib/lottery";
import { LotteryFundingError } from "@/features/casino/lib/lottery-funding";

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
  const t = useTranslations("casino.arkball");
  const queryClient = useQueryClient();
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  const wallet = evmAddress;
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
  const funding = useLotteryFunding(
    currentDraw.data ?? null,
    config.data?.rule.pricePerTicketUsdc ?? null
  );

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
    mutationFn: (request: LotteryPurchaseRequest) => {
      if (!privateReadsEnabled) throw new LotteryFundingError(t("funding.signIn"));
      if (!funding.pendingTicket) {
        if (!eligibility.data || !tickets.data)
          throw new LotteryFundingError(t("funding.eligibilityLoading"));
        if (!eligibility.data.eligible)
          throw new LotteryFundingError(eligibility.data.reason || t("notEligible"));
        if (
          tickets.data.some(
            (ticket) =>
              ticket.drawId === currentDraw.data?.id &&
              lotterySelectionKey(ticket) === lotterySelectionKey(request.selection)
          )
        ) {
          throw new LotteryFundingError(t("combinationOwned"));
        }
      }
      return funding.purchase(request);
    },
    retry: false,
    onSuccess: async () => {
      if (!wallet) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.currentDraw }),
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.tickets(wallet) }),
        queryClient.invalidateQueries({ queryKey: LOTTERY_KEYS.eligibility(wallet) }),
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
    availableUsdc: funding.availableUsdc,
    balanceLoading: funding.balanceLoading,
    balanceError: funding.balanceError,
    fundingConfigured: funding.configured,
    pendingTicket: funding.pendingTicket,
    purchasePhase: funding.phase,
    loading: config.isLoading || currentDraw.isLoading,
    error: config.error ?? currentDraw.error ?? funding.pendingError,
    ticketsLoading: privateReadsEnabled && tickets.isLoading,
    quickPick: quickPick.mutateAsync,
    quickPicking: quickPick.isPending,
    purchase: purchase.mutateAsync,
    purchasing: purchase.isPending || funding.purchasing,
  };
}
