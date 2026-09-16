"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmArkjetDeposit,
  createArkjetWithdrawal,
  fetchArkjetFundingConfig,
  type ArkjetWithdrawal,
} from "@/features/casino/lib/api/arkjet";
import { ARKJET_KEYS } from "@/features/casino/hooks/use-arkjet";
import { useSendToken } from "@/hooks/use-withdraw";
import type { GatewayApiError } from "@/lib/api/envelope";
import { getWalletAddress } from "@/lib/user";
import { toBaseUnits } from "@/lib/trade/math";

const CONFIG_STALE_MS = 5 * 60_000;
const CONFIRM_ATTEMPTS = 5;
const CONFIRM_DELAY_MS = 3_000;
const WITHDRAWAL_ATTEMPT_PREFIX = "arkjet:withdrawal-attempt:v1";

export type ArkjetDepositPhase = "idle" | "sending" | "confirming";

export interface ArkjetDepositOutcome {
  txHash: string;
  credited: string | null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFundingUnavailable(error: unknown): boolean {
  const code = (error as GatewayApiError | null)?.code;
  return code === "CONFLICT" || code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
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
  const { user, ready, authenticated } = usePrivy();
  const wallet = getWalletAddress(user, "ethereum");
  const queryClient = useQueryClient();
  const { sendToken } = useSendToken();
  const [depositPhase, setDepositPhase] = useState<ArkjetDepositPhase>("idle");

  const config = useQuery({
    queryKey: ARKJET_KEYS.funding,
    queryFn: fetchArkjetFundingConfig,
    staleTime: CONFIG_STALE_MS,
    retry: (failureCount, error) => !isFundingUnavailable(error) && failureCount < 2,
  });

  const invalidateBalance = () => {
    void queryClient.invalidateQueries({ queryKey: ARKJET_KEYS.balance });
  };

  const deposit = useMutation({
    mutationFn: async (amountUsdc: string): Promise<ArkjetDepositOutcome> => {
      if (!config.data) throw new Error("Arkjet wallet funding is not configured.");
      if (!ready || !authenticated || !wallet) throw new Error("Connect your Privy wallet first.");

      setDepositPhase("sending");
      try {
        const txHash = await sendToken({
          network: networkForChain(config.data.chainId),
          tokenAddress: config.data.tokenAddress,
          decimals: config.data.tokenDecimals,
          to: config.data.depositAddress,
          amount: toBaseUnits(amountUsdc, config.data.tokenDecimals),
        });

        setDepositPhase("confirming");
        for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
          if (attempt > 0) await wait(CONFIRM_DELAY_MS);
          try {
            const confirmed = await confirmArkjetDeposit(txHash);
            return { txHash, credited: confirmed.creditedAmount };
          } catch (error) {
            if (!isDepositStillConfirming(error)) throw error;
          }
        }

        return { txHash, credited: null };
      } finally {
        setDepositPhase("idle");
      }
    },
    onSettled: invalidateBalance,
  });

  const withdraw = useMutation({
    mutationFn: async (amountNgn: string): Promise<ArkjetWithdrawal> => {
      if (!ready || !authenticated || !wallet) throw new Error("Connect your Privy wallet first.");
      const idempotencyKey = getWithdrawalIdempotencyKey(wallet, amountNgn);
      const result = await createArkjetWithdrawal(amountNgn, idempotencyKey);
      clearWithdrawalIdempotencyKey(wallet, amountNgn);

      if (result.status === "FAILED") {
        throw new Error("The withdrawal failed and your Arkjet balance was restored. Try again.");
      }
      return result;
    },
    onSettled: invalidateBalance,
  });

  return {
    configured: config.isSuccess,
    config: config.data ?? null,
    configLoading: config.isLoading,
    wallet,
    deposit: deposit.mutateAsync,
    depositing: deposit.isPending,
    depositPhase,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
  };
}
