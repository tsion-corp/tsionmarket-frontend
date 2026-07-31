"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  confirmChessDeposit,
  createChessWithdrawal,
  feePctFromBps,
  fetchCashierConfig,
  fetchChessBalance,
  isCashierUnavailable,
  USDC_DECIMALS,
  type CashierWithdrawal,
} from "@/lib/casino/api/cashier";
import { useSendToken } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { toBaseUnits } from "@/lib/trade/math";

// The chess cashier's balance and money movements. Everything hangs off the
// config query: while the service reports the cashier unconfigured, nothing
// here polls and `configured` stays false, so every cashier surface renders
// nothing. The moment the backend configures it, the same code lights up.

const CASHIER_KEYS = {
  config: ["casino", "chess", "cashier", "config"] as const,
  balance: (wallet: string) => ["casino", "chess", "cashier", "balance", wallet] as const,
};

// The config is deployment state, not user state; it changes when the backend
// team flips it on, so an occasional re-read is plenty.
const CONFIG_STALE_MS = 5 * 60_000;
// Stakes lock and settle server-side, so the balance moves without any local
// action; poll it while a cashier screen is mounted.
const BALANCE_POLL_MS = 15_000;

// The service wants the deposit transfer at its confirmation depth before it
// credits, so the first confirm right after the send can legitimately fail.
// Four tries three seconds apart cover Base's confirmation time comfortably.
const CONFIRM_ATTEMPTS = 4;
const CONFIRM_DELAY_MS = 3_000;

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
  const { user } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");

  const config = useQuery({
    queryKey: CASHIER_KEYS.config,
    queryFn: fetchCashierConfig,
    staleTime: CONFIG_STALE_MS,
    // "Not configured" is an answer, not a fault; retrying would hammer the
    // service for a state that only changes by deployment.
    retry: (failureCount, error) => !isCashierUnavailable(error) && failureCount < 2,
  });

  const configured = config.isSuccess;

  const balance = useQuery({
    queryKey: CASHIER_KEYS.balance(wallet ?? "none"),
    queryFn: () => fetchChessBalance(wallet as string),
    enabled: configured && !!wallet,
    refetchInterval: BALANCE_POLL_MS,
  });

  return {
    configured,
    config: config.data ?? null,
    wallet,
    // Display-only fee percentage (500 bps -> 5); null until the config loads.
    feePct: config.data ? feePctFromBps(config.data.platformFeeBps) : null,
    available: balance.data?.availableUsdc ?? "0",
    locked: balance.data?.lockedUsdc ?? "0",
    balanceLoading: balance.isLoading,
  };
}

// The full cashier: status plus deposits and withdrawals. Deposits sign with
// the embedded wallet, so this hook mounts the wallet SDK; only cashier
// surfaces (the sheet) should use it, everything else reads
// useChessCashierStatus.
export function useChessCashier() {
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

        setDepositPhase("confirming");
        for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
          if (attempt > 0) await wait(CONFIRM_DELAY_MS);
          try {
            const credited = await confirmChessDeposit(wallet, txHash);
            return { txHash, credited: credited.amountUsdc };
          } catch {
            // Most likely still short of the confirmation depth. The confirm
            // is idempotent by hash, so trying again is free.
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
    onSettled: invalidateBalance,
  });

  const withdraw = useMutation({
    mutationFn: (amountUsdc: string): Promise<CashierWithdrawal> => {
      if (!wallet) throw new Error("Connect your wallet first.");
      return createChessWithdrawal(wallet, amountUsdc);
    },
    onSuccess: invalidateBalance,
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
