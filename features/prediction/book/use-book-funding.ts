"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSendToken } from "@/hooks/use-withdraw";
import { toBaseUnits } from "@/lib/trade/math";
import {
  confirmBookDeposit,
  createBookWithdrawal,
  getBookBalance,
  getBookFundingConfig,
} from "./api";

const CONFIRM_ATTEMPTS = 5;
const CONFIRM_DELAY_MS = 3_000;
const PENDING_PREFIX = "prediction:pending-deposit:v1";
const TX_HASH = /^0x[0-9a-fA-F]{64}$/u;

export const BOOK_FUNDING_KEYS = {
  balance: ["prediction", "book", "balance"] as const,
  config: ["prediction", "book", "funding"] as const,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pendingKey(wallet: string): string {
  return `${PENDING_PREFIX}:${wallet.toLowerCase()}`;
}

function readPending(wallet: string | null): string | null {
  if (!wallet) return null;
  try {
    const value = localStorage.getItem(pendingKey(wallet));
    return value && TX_HASH.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writePending(wallet: string, txHash: string): void {
  try {
    localStorage.setItem(pendingKey(wallet), txHash);
  } catch {
    // Manual transaction-hash recovery remains available in the cashier.
  }
}

function removePending(wallet: string, txHash: string): void {
  try {
    if (localStorage.getItem(pendingKey(wallet))?.toLowerCase() === txHash.toLowerCase()) {
      localStorage.removeItem(pendingKey(wallet));
    }
  } catch {
    // Storage can be blocked without affecting idempotent server confirmation.
  }
}

function isStillConfirming(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("not confirmed") ||
    message.includes("confirmation") ||
    message.includes("block number") ||
    message.includes("failed to read")
  );
}

function networkForChain(chainId: number): string {
  if (chainId === 8_453) return "base-mainnet";
  throw new Error(`Prediction funding does not support chain ${chainId}.`);
}

export function useBookFunding() {
  const { ready, authenticated, evmAddress } = useAuthSession();
  const queryClient = useQueryClient();
  const { sendToken } = useSendToken();
  const config = useQuery({
    queryKey: BOOK_FUNDING_KEYS.config,
    queryFn: getBookFundingConfig,
    staleTime: 5 * 60_000,
    retry: 2,
  });
  const balance = useQuery({
    queryKey: BOOK_FUNDING_KEYS.balance,
    queryFn: getBookBalance,
    enabled: ready && authenticated,
    staleTime: 5_000,
  });

  const invalidateBalance = async () => {
    await queryClient.invalidateQueries({ queryKey: BOOK_FUNDING_KEYS.balance });
  };

  const confirm = async (txHash: string) => {
    if (!ready || !authenticated || !evmAddress) throw new Error("Sign in before adding funds.");
    const normalized = txHash.trim();
    if (!TX_HASH.test(normalized)) throw new Error("Enter a valid Base transaction hash.");
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(CONFIRM_DELAY_MS);
      try {
        const result = await confirmBookDeposit(normalized);
        removePending(evmAddress, normalized);
        return result;
      } catch (error) {
        if (!isStillConfirming(error) || attempt === CONFIRM_ATTEMPTS - 1) throw error;
      }
    }
    throw new Error("Deposit confirmation timed out.");
  };

  const deposit = useMutation({
    mutationFn: async (amountUsdc: string) => {
      if (!ready || !authenticated || !evmAddress) throw new Error("Sign in before adding funds.");
      const refreshed = await config.refetch();
      const funding = refreshed.data;
      if (!funding?.depositsEnabled || !funding.depositAddress) {
        throw new Error("Prediction deposits are not configured.");
      }
      const txHash = await sendToken({
        network: networkForChain(funding.chainId),
        tokenAddress: funding.tokenAddress,
        decimals: funding.tokenDecimals,
        to: funding.depositAddress,
        amount: toBaseUnits(amountUsdc, funding.tokenDecimals),
      });
      writePending(evmAddress, txHash);
      return confirm(txHash);
    },
    onSettled: invalidateBalance,
  });

  const recover = useMutation({
    mutationFn: confirm,
    onSettled: invalidateBalance,
  });

  const withdraw = useMutation({
    mutationFn: async ({ amountE6, key }: { amountE6: string; key: string }) =>
      createBookWithdrawal(amountE6, key),
    onSettled: invalidateBalance,
  });

  return {
    config: config.data ?? null,
    configLoading: config.isLoading,
    configError: config.error,
    balance: balance.data ?? null,
    balanceLoading: balance.isLoading,
    balanceError: balance.error,
    pendingDepositHash: readPending(evmAddress),
    deposit: deposit.mutateAsync,
    depositing: deposit.isPending,
    depositError: deposit.error,
    recover: recover.mutateAsync,
    recovering: recover.isPending,
    recoveryError: recover.error,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
    withdrawalError: withdraw.error,
  };
}
