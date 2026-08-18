"use client";

import { useMutation } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaToBase } from "@/hooks/use-solana-to-base";
import { useSendToken } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { fetchSellQuote } from "@/lib/sell";

export interface SellExecuteInput {
  // Alchemy network id of the held asset.
  network: string;
  // Held token address, or null for a native balance.
  asset: string | null;
  decimals: number;
  amount: bigint;
  slippageBps: number;
  // True when the amount came from a Max action. If confirmed chain state has
  // changed, the UI can preserve that intent while requiring another review.
  maxRequested?: boolean;
}

export interface SellExecuteResult {
  rail: "dextopus";
  requestId: string;
  txHash: string;
  // Expected USDC proceeds, in base units (6 decimals).
  estimatedOutput: bigint;
}

// Executes a sell into USDC on Base.
//
// EVM assets go through Dextopus: quote the asset, send it to the returned
// deposit address on its own chain, and Dextopus settles USDC to the user's
// Base wallet.
//
// Solana assets use the same Dextopus route: a sponsored direct transfer funds
// its deposit address and Dextopus settles Base USDC. Quote or preflight
// failures stop before funds move; they are never rerouted to another provider.
export function useSell() {
  const { user } = usePrivy();
  const { sendToken } = useSendToken();
  const settleSolana = useSolanaToBase();

  return useMutation<SellExecuteResult, Error, SellExecuteInput>({
    onError: (error) => {
      // The sheet shows a friendly line; the console keeps the raw failure so
      // a masked error is never undebuggable.
      console.error("Sell failed:", error);
    },
    mutationFn: async ({ network, asset, decimals, amount, slippageBps, maxRequested = false }) => {
      // Proceeds settle as USDC on Base, an EVM asset, so the recipient is the
      // EVM wallet. Refunds go back to the wallet on the asset's own chain.
      const recipient = getWalletAddress(user, "ethereum");
      const originChainType = network === "solana-mainnet" ? "solana" : "ethereum";
      const refundTo = getWalletAddress(user, originChainType);
      if (!recipient) throw new Error("No Base wallet is connected.");
      if (!refundTo) throw new Error("No wallet for this asset's network.");

      if (network === "solana-mainnet") {
        return settleSolana({ asset, decimals, amount, slippageBps, maxRequested });
      }

      const quote = await fetchSellQuote({
        network,
        asset,
        amount,
        recipient,
        refundTo,
        slippageBps,
      });
      const txHash = await sendToken({
        network,
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
  });
}
