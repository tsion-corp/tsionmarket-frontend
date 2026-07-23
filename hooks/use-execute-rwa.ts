"use client";

import { useCallback } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import type { RwaAction, RwaStep } from "@/lib/rwa-api";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Signs and sends each step of a built RWA action with the embedded wallet.
// Solana steps carry a base64 versioned transaction; EVM steps carry to/data.
// The backend never signs, so every step is signed client-side here.
export function useExecuteRwa() {
  const { sendTransaction } = useSendTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets: solanaWallets } = useWallets();

  return useCallback(
    async (action: RwaAction, onStep?: (index: number, step: RwaStep) => void) => {
      for (let i = 0; i < action.steps.length; i++) {
        const step = action.steps[i];
        onStep?.(i, step);
        if (step.kind !== "sign-transaction" || !step.tx) {
          throw new Error(`This trade needs a step we can't sign yet (${step.kind}).`);
        }

        if (action.chain === "solana") {
          const wallet = solanaWallets[0];
          if (!wallet) throw new Error("No Solana wallet is connected.");
          if (!step.tx.base64) throw new Error("The transaction is missing.");
          await signAndSendTransaction({ transaction: base64ToBytes(step.tx.base64), wallet });
        } else {
          if (!step.tx.to) throw new Error("The transaction is missing.");
          await sendTransaction({
            to: step.tx.to,
            data: step.tx.data as `0x${string}` | undefined,
            value: step.tx.value ? BigInt(step.tx.value) : undefined,
          });
        }
      }
    },
    [sendTransaction, signAndSendTransaction, solanaWallets]
  );
}
