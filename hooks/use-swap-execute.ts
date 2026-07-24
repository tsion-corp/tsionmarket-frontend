"use client";

import { useCallback } from "react";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { createSolanaRpc, getBase58Decoder, signature as toSignature } from "@solana/kit";
import { buildJupiterSwapTransaction } from "@/lib/trade/jupiter";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Waits for the swap to confirm on-chain so the caller's balance refetch reflects
// the received token instead of the pre-swap balance. Best-effort: returns after
// confirmation, a failure, or a short timeout.
async function confirmSolana(sigBase58: string): Promise<void> {
  const rpc = createSolanaRpc(SOLANA_RPC);
  const sig = toSignature(sigBase58);
  for (let i = 0; i < 20; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const status = value[0];
    if (status) {
      if (status.err) throw new Error("The swap failed on-chain.");
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

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
      const { signature } = await signAndSendTransaction({
        transaction: base64ToBytes(txBase64),
        wallet,
      });
      await confirmSolana(getBase58Decoder().decode(signature));
    },
    [signAndSendTransaction, wallets]
  );
}
