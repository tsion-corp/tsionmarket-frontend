"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmArkjetDeposit,
  createArkjetWithdrawal,
  fetchArkjetFundingConfig,
  type ArkjetWithdrawal,
} from "@/features/casino/lib/api/arkjet";
import { ARKJET_KEYS } from "@/features/casino/hooks/use-arkjet";
import { useSendToken } from "@/hooks/use-withdraw";
import { errorStatus, type GatewayApiError } from "@/lib/api/envelope";

import { toBaseUnits } from "@/lib/trade/math";
import { validateArkjetFundingConfig } from "@/features/casino/lib/arkjet-funding";

const CONFIG_STALE_MS = 5 * 60_000;
const CONFIRM_ATTEMPTS = 5;
const CONFIRM_DELAY_MS = 3_000;
const PENDING_DEPOSIT_PREFIX = "arkjet:pending-deposit:v1";
const PENDING_DEPOSIT_EVENT = "arkjet:pending-deposit-change";
const WITHDRAWAL_ATTEMPT_PREFIX = "arkjet:withdrawal-attempt:v1";
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

export type ArkjetDepositPhase = "idle" | "sending" | "confirming";

export interface ArkjetDepositOutcome {
  txHash: string;
  credited: string | null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pendingDepositStorageKey(wallet: string): string {
  return `${PENDING_DEPOSIT_PREFIX}:${wallet.toLowerCase()}`;
}

function readPendingDeposit(wallet: string): string | null {
  try {
    const txHash = localStorage.getItem(pendingDepositStorageKey(wallet));
    return txHash && TRANSACTION_HASH.test(txHash) ? txHash : null;
  } catch {
    return null;
  }
}

function writePendingDeposit(wallet: string, txHash: string): void {
  try {
    localStorage.setItem(pendingDepositStorageKey(wallet), txHash);
    window.dispatchEvent(new Event(PENDING_DEPOSIT_EVENT));
  } catch {
    // Recovery remains available through manual transaction-hash entry.
  }
}

function removePendingDeposit(wallet: string, txHash: string): void {
  try {
    const storageKey = pendingDepositStorageKey(wallet);
    if (localStorage.getItem(storageKey)?.toLowerCase() === txHash.toLowerCase()) {
      localStorage.removeItem(storageKey);
      window.dispatchEvent(new Event(PENDING_DEPOSIT_EVENT));
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function subscribePendingDeposit(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PENDING_DEPOSIT_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PENDING_DEPOSIT_EVENT, onStoreChange);
  };
}

function isFundingUnavailable(error: unknown): boolean {
  const code = (error as GatewayApiError | null)?.code;
  return code === "CONFLICT" || code === "NOT_CONFIGURED";
}

function isDepositStillConfirming(error: unknown): boolean {
  const gatewayError = error as GatewayApiError | null;
  if (gatewayError?.code === "SERVICE_UNAVAILABLE") return true;
  if (gatewayError?.code !== "CONFLICT") return false;
  const message = gatewayError.message.toLowerCase();
  return (
    message.includes("not confirmed") ||
    message.includes("confirmation") ||
    message.includes("block number")
  );
}

function networkForChain(chainId: number): string {
  if (chainId === 8_453) return "base-mainnet";
  throw new Error(`Arkjet funding does not support chain ${chainId}.`);
}

function withdrawalAttemptStorageKey(wallet: string, amount: string): string {
  return `${WITHDRAWAL_ATTEMPT_PREFIX}:${wallet.toLowerCase()}:${amount}`;
}

function getWithdrawalIdempotencyKey(wallet: string, amount: string): string {
  const storageKey = withdrawalAttemptStorageKey(wallet, amount);
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function clearWithdrawalIdempotencyKey(wallet: string, amount: string): void {
  try {
    sessionStorage.removeItem(withdrawalAttemptStorageKey(wallet, amount));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function useArkjetFunding() {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  const wallet = evmAddress;
  const queryClient = useQueryClient();
  const { sendToken } = useSendToken();
  const [depositPhase, setDepositPhase] = useState<ArkjetDepositPhase>("idle");
  const pendingDepositHash = useSyncExternalStore(
    subscribePendingDeposit,
    () => (wallet ? readPendingDeposit(wallet) : null),
    () => null
  );

  const config = useQuery({
    queryKey: ARKJET_KEYS.funding,
    queryFn: async () => validateArkjetFundingConfig(await fetchArkjetFundingConfig()),
    staleTime: CONFIG_STALE_MS,
    refetchOnMount: "always",
    throwOnError: false,
    retry: (failureCount, error) =>
      errorStatus(error) !== 429 && !isFundingUnavailable(error) && failureCount < 3,
  });

  const invalidateBalance = () => {
    void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance });
  };

  const confirmDeposit = async (txHash: string): Promise<ArkjetDepositOutcome> => {
    if (!ready || !authenticated || !wallet) throw new Error("Connect your Privy wallet first.");
    const normalizedHash = txHash.trim();
    if (!TRANSACTION_HASH.test(normalizedHash)) {
      throw new Error("Enter a valid Base transaction hash.");
    }

    setDepositPhase("confirming");
    try {
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        if (attempt > 0) await wait(CONFIRM_DELAY_MS);
        try {
          const confirmed = await confirmArkjetDeposit(normalizedHash);
          removePendingDeposit(wallet, normalizedHash);
          return { txHash: normalizedHash, credited: confirmed.creditedAmount };
        } catch (error) {
          if (!isDepositStillConfirming(error)) throw error;
        }
      }

      return { txHash: normalizedHash, credited: null };
    } finally {
      setDepositPhase("idle");
    }
  };

  const deposit = useMutation({
    mutationFn: async (amountUsdc: string): Promise<ArkjetDepositOutcome> => {
      if (!ready || !authenticated || !wallet) throw new Error("Connect your Privy wallet first.");

      // Custody configuration is money-routing data. Refresh it immediately
      // before signing so a backend restart or deployment switch cannot use a
      // stale deposit address from the React Query cache.
      const refreshed = await config.refetch();
      if (!refreshed.data) {
        if (refreshed.error) throw refreshed.error;
        throw new Error("Arkjet wallet funding is not configured.");
      }
      const freshConfig = refreshed.data;

      setDepositPhase("sending");
      try {
        const txHash = await sendToken({
          network: networkForChain(freshConfig.chainId),
          tokenAddress: freshConfig.tokenAddress,
          decimals: freshConfig.tokenDecimals,
          to: freshConfig.depositAddress,
          amount: toBaseUnits(amountUsdc, freshConfig.tokenDecimals),
        });

        writePendingDeposit(wallet, txHash);
        try {
          return await confirmDeposit(txHash);
        } catch {
          // The wallet transfer is already final at this point. Never report
          // a confirmation/API failure as though the transfer itself failed;
          // retain the hash so the idempotent ledger credit can be retried.
          return { txHash, credited: null };
        }
      } finally {
        setDepositPhase("idle");
      }
    },
    onSettled: invalidateBalance,
  });

  const recoverDeposit = useMutation({
    mutationFn: confirmDeposit,
    onSettled: invalidateBalance,
  });

  const withdraw = useMutation({
    mutationFn: async (amountUsdc: string): Promise<ArkjetWithdrawal> => {
      if (!config.data) throw new Error("Arkjet wallet funding is not configured.");
      if (!ready || !authenticated || !wallet) throw new Error("Connect your Privy wallet first.");
      const idempotencyKey = getWithdrawalIdempotencyKey(wallet, amountUsdc);
      const result = await createArkjetWithdrawal(amountUsdc, idempotencyKey);
      clearWithdrawalIdempotencyKey(wallet, amountUsdc);

      if (result.status === "FAILED") {
        throw new Error("The withdrawal failed and your Arkjet balance was restored. Try again.");
      }
      return result;
    },
    onSettled: invalidateBalance,
  });

  return {
    configured: config.isSuccess,
    configUnavailable: config.isError && isFundingUnavailable(config.error),
    configError: config.isError && !isFundingUnavailable(config.error) ? config.error : null,
    config: config.data ?? null,
    configLoading: config.isLoading,
    retryConfig: config.refetch,
    wallet,
    deposit: deposit.mutateAsync,
    depositing: deposit.isPending,
    depositPhase,
    pendingDepositHash,
    recoverDeposit: recoverDeposit.mutateAsync,
    recoveringDeposit: recoverDeposit.isPending,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
  };
}
