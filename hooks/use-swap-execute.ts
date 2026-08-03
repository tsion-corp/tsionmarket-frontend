"use client";

import { useCallback } from "react";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import { buildJupiterSwapTransaction } from "@/lib/trade/jupiter";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { sponsorSolanaTransaction } from "@/lib/trade/solana-sponsor";

export interface SwapExecuteInput {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}

// Builds the Jupiter swap transaction for the embedded Solana wallet and signs
// and sends it. The backend never holds keys; the wallet signs client-side.
export function useSwapExecute() {
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets } = useWallets();

  return useCallback(
    async (input: SwapExecuteInput): Promise<void> => {
      const wallet = wallets[0];
      if (!wallet) throw new Error("No Solana wallet is connected.");
      const txBase64 = await buildJupiterSwapTransaction(input, wallet.address);
      const transaction = await sponsorSolanaTransaction(txBase64);
      const { signature } = await signAndSendTransaction({
        transaction,
        wallet,
        // Broadcast-only: the confirmation below polls the RPC we send
        // through, rather than a WebSocket we do not proxy.
        options: { optimisticBroadcast: true },
      });
      await confirmSolanaSignature(getBase58Decoder().decode(signature));
    },
    [signAndSendTransaction, wallets]
  );
}
