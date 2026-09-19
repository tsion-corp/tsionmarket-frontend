"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CASHIER_KEYS, useChessCashier } from "./use-chess-cashier";
import {
  confirmChessDeposit,
  cashierFundingPlan,
  normalizeUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import { purchaseLotteryTicket, type LotteryDraw } from "@/features/casino/lib/api/lottery";
import {
  completeLotterySelection,
  lotterySalesOpen,
  lotterySelectionKey,
} from "@/features/casino/lib/lottery";
import {
  pendingLotteryTicketKey,
  readPendingLotteryTicket,
  LotteryFundingError,
  type PendingLotteryTicket,
} from "@/features/casino/lib/lottery-funding";
import type { LotteryPurchaseRequest } from "./use-lottery";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fromBaseUnits } from "@/lib/trade/math";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";
import { errorCode } from "@/lib/api/envelope";

export function useLotteryFunding(draw: LotteryDraw | null, priceUsdc: string | null) {
  const t = useTranslations("casino.arkball.funding");
  const queryClient = useQueryClient();
  const portfolio = usePortfolio({ scope: "base" });
  const inFlight = useRef(false);
  const fundingRequest = useRef<Omit<PendingLotteryTicket, "txHash"> | null>(null);
  const retained = useRef<PendingLotteryTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingKey = (wallet: string) =>
    ["casino", "lottery", "pending-purchase", wallet.toLowerCase()] as const;

  const retainTransfer = (txHash: string) => {
    const request = fundingRequest.current;
    if (!request) throw new LotteryFundingError(t("requestMissing"));
    const pending = { ...request, txHash };
    retained.current = pending;
    localStorage.setItem(pendingLotteryTicketKey(request.wallet), JSON.stringify(pending));
    queryClient.setQueryData(pendingKey(request.wallet), pending);
  };
  const cashier = useChessCashier({ onDepositSent: retainTransfer });
  const wallet = cashier.wallet;
  const pending = useQuery({
    queryKey: pendingKey(wallet ?? "none"),
    queryFn: () => readPendingLotteryTicket(wallet as string),
    enabled: !!wallet,
    staleTime: Infinity,
    retry: false,
  });
  const token = portfolio.tokens.find(
    (item) =>
      item.network === "base-mainnet" &&
      item.address?.toLowerCase() === USDC_BY_CHAIN.base.address.toLowerCase()
  );
  const walletUsdc = token ? fromBaseUnits(BigInt(token.rawBalance), token.decimals) : "0";
  const funding = priceUsdc ? cashierFundingPlan(priceUsdc, cashier.available, walletUsdc) : null;
  const needsWallet = !funding || funding.depositUsdc !== "0";
  const availableUsdc = funding?.totalAvailableUsdc ?? walletUsdc;

  const purchase = useMutation({
    retry: false,
    mutationFn: async (request: LotteryPurchaseRequest) => {
      if (inFlight.current) throw new LotteryFundingError(t("inProgress"));
      if (!wallet) throw new LotteryFundingError(t("signIn"));
      const selection = completeLotterySelection(
        request.selection.whiteNumbers,
        request.selection.powerNumber
      );
      if (!selection) throw new LotteryFundingError(t("invalidSelection"));
      inFlight.current = true;
      try {
        let saved =
          retained.current?.wallet.toLowerCase() === wallet.toLowerCase()
            ? retained.current
            : readPendingLotteryTicket(wallet);
        if (saved) {
          if (lotterySelectionKey(saved.selection) !== lotterySelectionKey(selection)) {
            throw new LotteryFundingError(t("pendingTicket"));
          }
          // The wallet may now be empty. Repair this transfer, never send it again.
          if (saved.txHash) await confirmChessDeposit(wallet, saved.txHash);
        } else {
          if (!draw || !lotterySalesOpen(draw.status, draw.salesCloseAt))
            throw new LotteryFundingError(t("salesClosed"));
          const amountUsdc = priceUsdc ? normalizeUsdcAmount(priceUsdc) : null;
          if (!amountUsdc) throw new LotteryFundingError(t("priceUnavailable"));
          if (!cashier.configured) throw new LotteryFundingError(t("unavailable"));
          if (cashier.balanceLoading || (needsWallet && portfolio.loading))
            throw new LotteryFundingError(t("balanceLoading"));
          if (cashier.balanceError || (needsWallet && portfolio.error))
            throw new LotteryFundingError(t("balanceUnavailable"));
          const plan = cashierFundingPlan(amountUsdc, cashier.available, walletUsdc);
          if (!plan?.sufficient) throw new LotteryFundingError(t("insufficient"));
          fundingRequest.current = {
            wallet,
            drawId: draw.id,
            amountUsdc: plan.depositUsdc,
            selection,
            idempotencyKey: request.idempotencyKey,
          };
          // Verify storage access before any funds move.
          localStorage.setItem(pendingLotteryTicketKey(wallet), "");
          if (plan.depositUsdc !== "0") {
            const outcome = await cashier.deposit(plan.depositUsdc);
            if (!retained.current || retained.current.txHash !== outcome.txHash)
              retainTransfer(outcome.txHash);
            saved = retained.current;
            if (!outcome.credited)
              throw new LotteryFundingError(t("confirming"), { pending: true });
          } else {
            saved = { ...fundingRequest.current, txHash: null };
            retained.current = saved;
            localStorage.setItem(pendingLotteryTicketKey(wallet), JSON.stringify(saved));
            queryClient.setQueryData(pendingKey(wallet), saved);
          }
        }
        if (!saved) throw new LotteryFundingError(t("requestMissing"));
        setSubmitting(true);
        const input = { player: wallet, ...saved.selection, idempotencyKey: saved.idempotencyKey };
        const ticket = await purchaseLotteryTicket(saved.drawId, input).catch((error: unknown) => {
          // A definite closed-sales rejection means no ticket was accepted.
          // Keep the credited money in the withdrawable ledger, but release this retry.
          if (
            errorCode(error) === "CONFLICT" &&
            error instanceof Error &&
            error.message.includes("ticket sales are closed for this draw")
          ) {
            localStorage.removeItem(pendingLotteryTicketKey(wallet));
            retained.current = null;
            queryClient.setQueryData(pendingKey(wallet), null);
            throw new LotteryFundingError(t("closedAfterFunding"));
          }
          throw error;
        });
        localStorage.removeItem(pendingLotteryTicketKey(wallet));
        retained.current = null;
        queryClient.setQueryData(pendingKey(wallet), null);
        return ticket;
      } catch (error) {
        if (
          retained.current?.wallet.toLowerCase() === wallet.toLowerCase() &&
          !(error instanceof LotteryFundingError)
        ) {
          throw new LotteryFundingError(t("fundedPending"), { cause: error, pending: true });
        }
        throw error;
      } finally {
        setSubmitting(false);
        inFlight.current = false;
        fundingRequest.current = null;
        void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet) });
        void portfolio.refetchFresh(["base-mainnet"]);
      }
    },
  });

  return {
    purchase: purchase.mutateAsync,
    purchasing: purchase.isPending || cashier.depositing,
    availableUsdc,
    balanceLoading: cashier.balanceLoading || (needsWallet && portfolio.loading),
    balanceError: cashier.balanceError || (needsWallet && portfolio.error),
    phase: submitting ? ("submitting" as const) : cashier.depositPhase,
    configured: cashier.configured,
    pendingTicket: pending.data ?? null,
    pendingError: pending.error,
  };
}
