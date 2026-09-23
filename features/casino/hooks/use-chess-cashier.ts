"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  cashierLockBuckets,
  cashierTotalUsdc,
  confirmChessDeposit,
  createChessWithdrawal,
  feePctFromBps,
  fetchCashierConfig,
  fetchChessBalance,
  isCashierAccessDenied,
  isChessDepositPending,
  isCashierUnavailable,
  USDC_DECIMALS,
  type CashierWithdrawal,
} from "@/features/casino/lib/api/cashier";
import { useSessionWallet } from "@/components/providers/server-session";
import { useSendToken } from "@/hooks/use-withdraw";
import { toBaseUnits } from "@/lib/trade/math";
import { track } from "@/lib/analytics/mixpanel";

// The chess cashier's balance and money movements. Everything hangs off the
// config query: while the service reports the cashier unconfigured, nothing
// here polls and `configured` stays false, so every cashier surface renders
// nothing. The moment the backend configures it, the same code lights up.

export const CASHIER_KEYS = {
  config: ["casino", "chess", "cashier", "config"] as const,
  balance: (wallet: string) => ["casino", "chess", "cashier", "balance", wallet] as const,
};

// The config is deployment state, not user state; it changes when the backend
// team flips it on, so an occasional re-read is plenty.
const CONFIG_STALE_MS = 5 * 60_000;
// Money-changing actions invalidate this query immediately. This slower poll
// is only a repair path for a settlement or deposit confirmation missed while
// the client was disconnected.
export const CASHIER_BALANCE_STALE_MS = 60_000;
export const CASHIER_BALANCE_POLL_MS = 2 * 60_000;

// The service wants the deposit transfer at its confirmation depth before it
// credits, so the first confirm right after the send can legitimately fail.
// The sponsored send already waits for an on-chain receipt. Confirmation can
// still lag briefly between RPC providers, so retry promptly instead of
// making the user sit through a three-second blind wait each time.
const CONFIRM_ATTEMPTS = 4;
const CONFIRM_DELAY_MS = 1_000;

const NETWORK = "base-mainnet";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DepositPhase = "idle" | "sending" | "confirming";

export interface ChessDepositOutcome {
  txHash: string;
  // The credited amount once the service confirmed within the retry window.
  // Null means the send went through but the confirm has not landed yet: the
  // funds are safe with the cashier and credit on their own, so the caller
  // shows the "confirms in a moment" note rather than an error.
  credited: string | null;
}

// Read-only view of the cashier: is it configured, what does it charge, and
// what does this player hold. This is what the lobby, create and play screens
// mount; it touches no wallet SDK, so it is safe on screens that never move
// money.
export function useChessCashierStatus() {
  const { ready, authenticated } = usePrivy();
  const wallet = useSessionWallet("ethereum");

  const config = useQuery({
    queryKey: CASHIER_KEYS.config,
    queryFn: fetchCashierConfig,
    staleTime: CONFIG_STALE_MS,
    // "Not configured" is an answer, not a fault; retrying would hammer the
    // service for a state that only changes by deployment.
    retry: (failureCount, error) => !isCashierUnavailable(error) && failureCount < 2,
  });

  const configured = config.isSuccess;
  const enabled = configured && !!wallet && ready && authenticated;

  const balance = useQuery({
    queryKey: CASHIER_KEYS.balance(wallet ?? "none"),
    queryFn: () => fetchChessBalance(wallet as string),
    enabled,
    // Private reads need the verified Privy session. If the session is cold,
    // apiFetch throws before any request goes out; keep retrying that warm-up.
    // A real 401/NO_WALLET from the proxy is terminal until the user signs in
    // again or links the wallet, so stop there instead of hammering the route.
    retry: (failureCount, error) =>
      !isCashierAccessDenied(error) && !isCashierUnavailable(error) && failureCount < 4,
    staleTime: CASHIER_BALANCE_STALE_MS,
    refetchInterval: (query) =>
      isCashierAccessDenied(query.state.error) ? false : CASHIER_BALANCE_POLL_MS,
    refetchIntervalInBackground: false,
    // Refresh when the user returns without keeping an active game on a short
    // polling loop.
    refetchOnWindowFocus: true,
  });

  return {
    configured,
    config: config.data ?? null,
    wallet,
    // Display-only fee percentage (500 bps -> 5); null until the config loads.
    feePct: config.data ? feePctFromBps(config.data.platformFeeBps) : null,
    available: balance.data?.availableUsdc ?? "0",
    locked: balance.data?.lockedUsdc ?? "0",
    total: cashierTotalUsdc(balance.data),
    lockBuckets: cashierLockBuckets(balance.data),
    balanceLoading: enabled && balance.isLoading,
    balanceError: balance.isError,
  };
}

// Withdrawal-only access for the global chess navigation. Unlike the full
// cashier hook, this does not initialize token sending because legacy ledger
// funds can only leave the ledger; they can never be topped up from this UI.
export function useChessCashierWithdrawal() {
  const queryClient = useQueryClient();
  const status = useChessCashierStatus();
  const { wallet } = status;

  const withdraw = useMutation({
    mutationFn: (amountUsdc: string): Promise<CashierWithdrawal> => {
      if (!wallet) throw new Error("Connect your wallet first.");
      return createChessWithdrawal(wallet, amountUsdc);
    },
    onSuccess: () => {
      if (wallet) {
        void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet) });
      }
    },
  });

  return {
    ...status,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
  };
}

// The full cashier: status plus deposits and withdrawals. Deposits sign with
// the embedded wallet, so this hook mounts the wallet SDK; only cashier
// surfaces (the sheet) should use it, everything else reads
// useChessCashierStatus.
export function useChessCashier({
  onDepositSent,
}: { onDepositSent?: (txHash: string) => void } = {}) {
  const queryClient = useQueryClient();
  const status = useChessCashierStatus();
  const { sendToken } = useSendToken();
  const [depositPhase, setDepositPhase] = useState<DepositPhase>("idle");
  const { config, wallet } = status;

  const invalidateBalance = () => {
    if (wallet) void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet) });
  };

  // Deposit = send USDC on Base to the cashier's deposit address (gas
  // sponsored), then ask the service to credit that hash, retrying while the
  // transfer reaches confirmation depth.
  const deposit = useMutation({
    mutationFn: async (amountUsdc: string): Promise<ChessDepositOutcome> => {
      if (!config) throw new Error("Chess balances aren't available yet.");
      if (!wallet) throw new Error("Connect your wallet first.");

      setDepositPhase("sending");
      try {
        const txHash = await sendToken({
          network: NETWORK,
          tokenAddress: config.tokenAddress,
          decimals: USDC_DECIMALS,
          to: config.depositAddress,
          amount: toBaseUnits(amountUsdc, USDC_DECIMALS),
        });

        // Callers can retain the transfer before confirmation fails or times out.
        onDepositSent?.(txHash);

        setDepositPhase("confirming");
        for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
          if (attempt > 0) await wait(CONFIRM_DELAY_MS);
          try {
            const credited = await confirmChessDeposit(wallet, txHash);
            return { txHash, credited: credited.amountUsdc };
          } catch (error) {
            if (!isChessDepositPending(error)) throw error;
          }
        }
        // The money is with the cashier; only the credit acknowledgement is
        // late. Resolving (not throwing) keeps this out of the error path so
        // the UI reports it truthfully instead of as a failed deposit.
        return { txHash, credited: null };
      } finally {
        setDepositPhase("idle");
      }
    },
    onSuccess: (outcome, amountUsdc) => {
      // The money reached the cashier either way: a late credit is the
      // service acknowledging slowly, not a failed move. The credited figure
      // is preferred when there is one, since that is what actually landed.
      track("arkade_balance_funded", { amount_usd: Number(outcome.credited ?? amountUsdc) });
    },
    onSettled: invalidateBalance,
  });

  const withdraw = useMutation({
    mutationFn: (amountUsdc: string): Promise<CashierWithdrawal> => {
      if (!wallet) throw new Error("Connect your wallet first.");
      return createChessWithdrawal(wallet, amountUsdc);
    },
    onSuccess: (_withdrawal, amountUsdc) => {
      track("arkade_balance_withdrawn", { amount_usd: Number(amountUsdc) });
      invalidateBalance();
    },
  });

  return {
    ...status,
    deposit: deposit.mutateAsync,
    depositing: deposit.isPending,
    depositPhase,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
  };
}
