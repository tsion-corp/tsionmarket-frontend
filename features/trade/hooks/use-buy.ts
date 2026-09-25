"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { SETTLE_CHAINS, SOLANA_CHAIN_ID } from "@/lib/deposit";
import type { BuyRoute } from "@/lib/buy";
import { fetchBuyQuote } from "@/lib/buy-quote";

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
  const { evmAddress, solanaAddress } = useAuthSession();
  const { sendUsdc } = useSendUsdc();

  return useMutation<BuyExecuteResult, Error, BuyExecuteInput>({
    mutationFn: async ({ route, amount, slippageBps }) => {
      // The bought token settles to the user's own wallet on the destination
      // chain: Solana destinations settle to the Solana wallet, every other
      // chain to the EVM one.
      const recipient = route.destinationChainId === SOLANA_CHAIN_ID ? solanaAddress : evmAddress;
      const refundTo = evmAddress;
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
