"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcceptChallenge, useCreateChallenge } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CASHIER_KEYS, useChessCashier } from "@/features/casino/hooks/use-chess-cashier";
import {
  confirmChessDeposit,
  exceedsUsdcBalance,
  HUMAN_CHESS_WAGER_FEE_BPS,
  isChessDepositPending,
  normalizeUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import type { ChessMatch, CreateChessChallengeInput } from "@/features/casino/lib/api/types";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fromBaseUnits } from "@/lib/trade/math";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";

const BASE_NETWORK = "base-mainnet";
const BASE_USDC = USDC_BY_CHAIN.base.address.toLowerCase();

interface PendingDeposit {
  stakeUsdc: string;
  txHash: string;
}

function baseUsdcBalance(tokens: ReturnType<typeof usePortfolio>["tokens"]): string {
  const token =
    tokens.find(
      (item) => item.network === BASE_NETWORK && item.address?.toLowerCase() === BASE_USDC
    ) ??
    tokens.find((item) => item.network === BASE_NETWORK && item.symbol.toUpperCase() === "USDC");
  if (!token) return "0";
  return fromBaseUnits(BigInt(token.rawBalance), token.decimals);
}

export function friendTimeControl(value: string): string {
  const [seconds, increment] = value.split("+");
  const initialSeconds = Number.parseInt(seconds ?? "", 10);
  const incrementSeconds = Number.parseInt(increment ?? "", 10);
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) return "5+3";
  return `${initialSeconds / 60}+${incrementSeconds}`;
}

export function useFundedChessChallenge() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  const cashier = useChessCashier();
  const portfolio = usePortfolio({ scope: "base" });
  const createMutation = useCreateChallenge();
  const acceptMutation = useAcceptChallenge();
  const createChallenge = createMutation.mutateAsync;
  const acceptChallenge = acceptMutation.mutateAsync;
  const deposit = cashier.deposit;
  const refetchPortfolio = portfolio.refetchFresh;
  const pendingDeposit = useRef<PendingDeposit | null>(null);
  const actionInFlight = useRef(false);
  const [isFunding, setIsFunding] = useState(false);
  const availableUsdc = baseUsdcBalance(portfolio.tokens);

  const fund = useCallback(
    async (rawStake: string): Promise<string> => {
      const stakeUsdc = normalizeUsdcAmount(rawStake);
      if (!stakeUsdc) {
        throw new Error("Enter a valid USDC stake with no more than 6 decimal places.");
      }
      if (!wallet.connected || !wallet.address) throw new Error("Connect your wallet to play.");
      if (!cashier.configured) {
        throw new Error("Funded chess games are not available right now.");
      }
      if (portfolio.loading) throw new Error("Your Base USDC balance is still loading.");
      if (exceedsUsdcBalance(stakeUsdc, availableUsdc)) {
        throw new Error("Your Base USDC balance is too low for this stake.");
      }

      const pending = pendingDeposit.current;
      if (pending) {
        if (pending.stakeUsdc !== stakeUsdc) {
          throw new Error(
            `Finish confirming the pending ${pending.stakeUsdc} USDC stake before changing it.`
          );
        }
        try {
          await confirmChessDeposit(wallet.address, pending.txHash);
          return pending.txHash;
        } catch (error) {
          if (!isChessDepositPending(error)) throw error;
          throw new Error(
            "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
          );
        }
      }

      const outcome = await deposit(stakeUsdc);
      pendingDeposit.current = { stakeUsdc, txHash: outcome.txHash };
      if (!outcome.credited) {
        throw new Error(
          "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
        );
      }
      return outcome.txHash;
    },
    [
      availableUsdc,
      cashier.configured,
      deposit,
      portfolio.loading,
      wallet.address,
      wallet.connected,
    ]
  );

  const refreshBalances = useCallback(() => {
    if (wallet.address) {
      void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet.address) });
    }
    void refetchPortfolio(["base-mainnet"]);
  }, [queryClient, refetchPortfolio, wallet.address]);

  const runFunded = useCallback(
    async <T>(stakeUsdc: string, action: (txHash: string) => Promise<T>): Promise<T> => {
      if (actionInFlight.current)
        throw new Error("A chess funding request is already in progress.");
      actionInFlight.current = true;
      setIsFunding(true);
      try {
        const txHash = await fund(stakeUsdc);
        const result = await action(txHash);
        pendingDeposit.current = null;
        refreshBalances();
        return result;
      } finally {
        actionInFlight.current = false;
        setIsFunding(false);
      }
    },
    [fund, refreshBalances]
  );

  const create = useCallback(
    async (input: CreateChessChallengeInput & { stakeUsdc?: string | null }) => {
      const stakeUsdc = input.stakeUsdc ? normalizeUsdcAmount(input.stakeUsdc) : null;
      if (!stakeUsdc) return createChallenge({ ...input, stakeUsdc: null });
      return runFunded(stakeUsdc, () => createChallenge({ ...input, stakeUsdc }));
    },
    [createChallenge, runFunded]
  );

  const accept = useCallback(
    async (challengeId: string, stakeUsdc?: string | null): Promise<ChessMatch> => {
      const normalized = stakeUsdc ? normalizeUsdcAmount(stakeUsdc) : null;
      if (!normalized) return acceptChallenge(challengeId);
      return runFunded(normalized, () => acceptChallenge(challengeId));
    },
    [acceptChallenge, runFunded]
  );

  return {
    create,
    accept,
    fundEntry: runFunded,
    availableUsdc,
    balanceLoading: portfolio.loading,
    configured: cashier.configured,
    feeBps: HUMAN_CHESS_WAGER_FEE_BPS,
    isPending:
      isFunding || cashier.depositing || createMutation.isPending || acceptMutation.isPending,
  };
}
