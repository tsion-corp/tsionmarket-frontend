"use client";

import { useMutation } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
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
}

export interface SellExecuteResult {
  requestId: string;
  txHash: string;
  // Expected USDC proceeds, in base units (6 decimals).
  estimatedOutput: bigint;
}

// Executes a sell: quote the held asset into USDC on Base, then send that amount
// of the asset from the wallet to the returned deposit address on the asset's own
// chain. Dextopus settles the USDC proceeds to the user's Base wallet. Returns
// the requestId to poll status against (see useDepositStatus).
export function useSell() {
  const { user } = usePrivy();
  const { sendToken } = useSendToken();

  return useMutation<SellExecuteResult, Error, SellExecuteInput>({
    mutationFn: async ({ network, asset, decimals, amount, slippageBps }) => {
      // Proceeds settle as USDC on Base, an EVM asset, so the recipient is the
      // EVM wallet. Refunds go back to the wallet on the asset's own chain.
      const recipient = getWalletAddress(user, "ethereum");
      const originChainType = network === "solana-mainnet" ? "solana" : "ethereum";
      const refundTo = getWalletAddress(user, originChainType);
      if (!recipient) throw new Error("No Base wallet is connected.");
      if (!refundTo) throw new Error("No wallet for this asset's network.");

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
      return { requestId: quote.requestId, txHash, estimatedOutput: quote.estimatedOutput };
    },
  });
}
