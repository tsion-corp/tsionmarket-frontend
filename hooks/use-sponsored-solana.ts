"use client";

import { useCallback } from "react";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import {
  prepareSponsoredSolanaTransaction,
  sponsorAndSubmitSolanaTransaction,
} from "@/lib/trade/solana-sponsor";

export interface SponsoredSolanaSendInput {
  // The transaction to send, base64 or wire bytes, built with any fee payer:
  // prepare reseats the sponsor before the user signs.
  transaction: string | Uint8Array;
  wallet: ConnectedStandardSolanaWallet;
  prefundRent?: boolean;
}

// Sends a Solana transaction through gas sponsorship, in the gas-sponsor
// service's contract: prepare seats the sponsor wallet as fee payer, the user
// signs the prepared transaction with the embedded wallet, and the sponsor
// adds its signature and submits. Resolves to the on-chain signature; callers
// confirm it with confirmSolanaSignature as before.
export function useSponsoredSolanaSend() {
  const { signTransaction } = useSignTransaction();

  return useCallback(
    async ({ transaction, wallet, prefundRent }: SponsoredSolanaSendInput): Promise<string> => {
      const prepared = await prepareSponsoredSolanaTransaction(transaction, { prefundRent });
      const { signedTransaction } = await signTransaction({ transaction: prepared, wallet });
      // Prepare already put the sponsor in both the fee-payer and any token
      // account rent-payer seats. Asking submit to prefund again transfers a
      // duplicate rent reserve into the user's wallet.
      const result = await sponsorAndSubmitSolanaTransaction(signedTransaction);
      if (!result.submittedSignature) {
        throw new Error("The gas sponsor did not submit the transaction.");
      }
      return result.submittedSignature;
    },
    [signTransaction]
  );
}
