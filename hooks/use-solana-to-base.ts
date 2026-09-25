"use client";

import { useCallback } from "react";
import { useSendToken } from "@/hooks/use-withdraw";
import { fetchSellQuote } from "@/lib/sell";
import { fetchConfirmedSolanaBalance, SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { useAuthSession } from "@/hooks/use-auth-session";

export interface SolanaToBaseInput {
  asset: string | null;
  decimals: number;
  amount: bigint;
  slippageBps: number;
  maxRequested?: boolean;
}

export interface SolanaToBaseResult {
  rail: "dextopus";
  requestId: string;
  txHash: string;
  estimatedOutput: bigint;
}

// One Solana settlement executor for spot sales and post-RWA proceeds. It
// reads confirmed balances, uses Dextopus's direct deposit route, and always
// targets Base USDC. An ambiguous failure is never rerouted to another
// provider, which prevents duplicate cross-chain settlement attempts.
export function useSolanaToBase() {
  const { evmAddress, solanaAddress } = useAuthSession();
  const { sendToken } = useSendToken();

  return useCallback(
    async ({
      asset,
      decimals,
      amount,
      slippageBps,
      maxRequested = false,
    }: SolanaToBaseInput): Promise<SolanaToBaseResult> => {
      const recipient = evmAddress;
      const refundTo = solanaAddress;
      if (!recipient) throw new Error("No Base wallet is connected.");
      if (!refundTo) throw new Error("No Solana wallet is connected.");

      const liveBalance = await fetchConfirmedSolanaBalance(refundTo, asset);
      if (amount > liveBalance) {
        throw new SolanaBalanceChangedError(liveBalance, maxRequested);
      }

      const quote = await fetchSellQuote({
        network: "solana-mainnet",
        asset,
        amount,
        recipient,
        refundTo,
        slippageBps,
      });
      const txHash = await sendToken({
        network: "solana-mainnet",
        tokenAddress: asset,
        decimals,
        to: quote.depositAddress,
        amount,
      });
      return {
        rail: "dextopus",
        requestId: quote.requestId,
        txHash,
        estimatedOutput: quote.estimatedOutput,
      };
    },
    [evmAddress, solanaAddress, sendToken]
  );
}
