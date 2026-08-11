"use client";

import { useMutation } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { SETTLE_CHAINS, SOLANA_CHAIN_ID, type WalletChainType } from "@/lib/deposit";
import type { BuyRoute } from "@/lib/buy";
import { fetchBuyQuote } from "@/lib/buy-quote";

// The bought token settles to the user's own wallet on the destination chain.
// Solana destinations settle to the Solana embedded wallet, every other chain to
// the EVM one.
function recipientChainType(destinationChainId: number): WalletChainType {
  return destinationChainId === SOLANA_CHAIN_ID ? "solana" : "ethereum";
}

export interface BuyExecuteInput {
  route: BuyRoute;
  amount: bigint;
  slippageBps: number;
}

export interface BuyExecuteResult {
  requestId: string;
  txHash: string;
  // Expected destination token received, in that token's base units.
  estimatedOutput: bigint;
}

// Executes a buy: fetch a quote for the deposit address, then send that exact
// USDC amount on Base to it from the embedded wallet. Dextopus bridges and
// settles the bought token to the recipient on the destination chain. Returns
// the requestId to poll status against (see useDepositStatus).
export function useBuy() {
  const { user } = usePrivy();
  const { sendUsdc } = useSendUsdc();

  return useMutation<BuyExecuteResult, Error, BuyExecuteInput>({
    mutationFn: async ({ route, amount, slippageBps }) => {
      const recipient = getWalletAddress(user, recipientChainType(route.destinationChainId));
      const refundTo = getWalletAddress(user, "ethereum");
      if (!recipient) throw new Error("Connect a wallet for the destination first.");
      if (!refundTo) throw new Error("No Base wallet is connected.");

      const quote = await fetchBuyQuote({ route, amount, recipient, refundTo, slippageBps });
      const txHash = await sendUsdc({
        chainType: "ethereum",
        to: quote.depositAddress,
        amount,
        settle: SETTLE_CHAINS.base,
      });
      return { requestId: quote.requestId, txHash, estimatedOutput: quote.estimatedOutput };
    },
  });
}
