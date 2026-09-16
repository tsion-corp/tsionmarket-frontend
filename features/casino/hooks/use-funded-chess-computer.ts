"use client";

import { useCallback, useRef, useState } from "react";
import { useCreateComputerMatch } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashier } from "@/features/casino/hooks/use-chess-cashier";
import {
  confirmChessDeposit,
  exceedsUsdcBalance,
  isChessDepositPending,
  normalizeUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import type { ChessMatch, CreateComputerMatchInput } from "@/features/casino/lib/api/types";
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

export function useFundedChessComputer() {
  const wallet = useCasinoWallet();
  const cashier = useChessCashier();
  const portfolio = usePortfolio({ scope: "base" });
  const create = useCreateComputerMatch();
  const pendingDeposit = useRef<PendingDeposit | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const availableUsdc = baseUsdcBalance(portfolio.tokens);
  const cashierConfigured = cashier.configured;
  const deposit = cashier.deposit;
  const depositPending = cashier.depositing;
  const createMatch = create.mutateAsync;
  const createPending = create.isPending;
  const portfolioLoading = portfolio.loading;
  const refetchPortfolio = portfolio.refetchFresh;

  const start = useCallback(
    async (input: CreateComputerMatchInput): Promise<ChessMatch> => {
      if (!wallet.connected || !wallet.address) {
        throw new Error("Connect your wallet to play.");
      }

      const stakeUsdc = input.stakeUsdc ? normalizeUsdcAmount(input.stakeUsdc) : null;
      if (!stakeUsdc) return createMatch({ ...input, stakeUsdc: null });
      if (!cashierConfigured) {
        throw new Error("Funded chess games are not available right now.");
      }
      if (portfolioLoading) {
        throw new Error("Your Base USDC balance is still loading.");
      }
      if (exceedsUsdcBalance(stakeUsdc, availableUsdc)) {
        throw new Error("Your Base USDC balance is too low for this stake.");
      }

      setIsStarting(true);
      try {
        let txHash: string;
        const pending = pendingDeposit.current;
        if (pending) {
          if (pending.stakeUsdc !== stakeUsdc) {
            throw new Error(
              `Finish confirming the pending ${pending.stakeUsdc} USDC stake before changing it.`
            );
          }
          txHash = pending.txHash;
          try {
            await confirmChessDeposit(wallet.address, txHash);
          } catch (error) {
            if (!isChessDepositPending(error)) throw error;
            throw new Error(
              "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
            );
          }
        } else {
          const outcome = await deposit(stakeUsdc);
          txHash = outcome.txHash;
          pendingDeposit.current = { stakeUsdc, txHash };
          if (!outcome.credited) {
            throw new Error(
              "Your Base USDC transfer is still confirming. Retry shortly; no second transfer will be sent."
            );
          }
        }

        const match = await createMatch({
          ...input,
          level: 8,
          color: "random",
          stakeUsdc,
          coachEnabled: false,
          idempotencyKey: `deposit:${txHash}`,
        });
        pendingDeposit.current = null;
        void refetchPortfolio(["base-mainnet"]);
        return match;
      } finally {
        setIsStarting(false);
      }
    },
    [
      availableUsdc,
      cashierConfigured,
      createMatch,
      deposit,
      portfolioLoading,
      refetchPortfolio,
      wallet.address,
      wallet.connected,
    ]
  );

  return {
    start,
    availableUsdc,
    balanceLoading: portfolioLoading,
    configured: cashierConfigured,
    isStarting: isStarting || depositPending || createPending,
  };
}
