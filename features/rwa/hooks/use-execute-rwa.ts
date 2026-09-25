"use client";

import { useCallback } from "react";
import { awaitReceipt, isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { useEvmSend } from "@/hooks/use-evm-send";
import type { RwaAction, RwaChain, RwaStep } from "@/features/rwa/lib/api";

// EVM chain ids per RWA chain. Without an explicit chainId, Privy defaults to
// Ethereum mainnet (1), so a non-Ethereum RWA buy would be signed on the wrong
// chain and fail with "insufficient funds for gas".
const EVM_CHAIN_ID: Partial<Record<RwaChain, number>> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  bsc: 56,
  polygon: 137,
};

// Executes each step of a built RWA action with the embedded wallet. Solana
// steps go through gas sponsorship: the sponsor takes the fee-payer seat, the
// embedded wallet signs, and the sponsor submits. EVM steps send directly
// from the wallet.
export function useExecuteRwa() {
  const evmSend = useEvmSend();
  const sendSponsored = useSponsoredSolanaSend();

  return useCallback(
    async (
      action: RwaAction,
      expectedChain: RwaChain,
      onStep?: (index: number, step: RwaStep) => void
    ) => {
      // Never sign a step on a chain the caller did not ask for. The backend
      // builds these steps, so a bad or compromised response could otherwise
      // direct the wallet to sign on any chain. Checked before any signing.
      if (action.chain !== expectedChain) {
        throw new Error("This trade's transactions don't match its chain.");
      }
      for (const step of action.steps) {
        if (step.chain !== expectedChain) {
          throw new Error("This trade's transactions don't match its chain.");
        }
      }

      // The last step moves the balance (approve precedes it, ordered by nonce).
      // Track it so we can wait for it to settle before returning, which lets the
      // caller's portfolio refetch reflect the trade instead of the old balance.
      let lastEvm: { hash: string; chainId: number } | null = null;
      let lastSolanaSig: string | null = null;

      for (let i = 0; i < action.steps.length; i++) {
        const step = action.steps[i];
        onStep?.(i, step);
        if (step.kind !== "sign-transaction" || !step.tx) {
          throw new Error(`This trade needs a step we can't sign yet (${step.kind}).`);
        }

        if (action.chain === "solana") {
          if (!step.tx.base64) throw new Error("The transaction is missing.");
          lastSolanaSig = await sendSponsored({
            transaction: step.tx.base64,
            prefundRent: true,
          });
        } else {
          if (!step.tx.to) throw new Error("The transaction is missing.");
          const chainId = EVM_CHAIN_ID[step.chain];
          if (!chainId) throw new Error(`Unsupported chain for this trade: ${step.chain}`);
          // Sponsored EVM chains route through the 7702 path; the rest send
          // normally. Either way we get an on-chain hash to confirm below.
          const hash = await evmSend({
            to: step.tx.to as `0x${string}`,
            data: step.tx.data as `0x${string}` | undefined,
            // A native value leg is legitimate (paying with ETH). Its size is
            // only as trustworthy as the simulate-gated build that produced it;
            // there is no client-side bound on it beyond the chain check above.
            value: step.tx.value ? BigInt(step.tx.value) : undefined,
            chainId,
          });
          lastEvm = { hash, chainId };
        }
      }

      // Wait for the balance-changing transaction to confirm. EVM waits for a
      // receipt where we have a pinned read client; other chains are best-effort.
      // Solana polls the signature status.
      if (lastEvm && isReceiptChain(lastEvm.chainId)) {
        await awaitReceipt(publicClientForChain(lastEvm.chainId), lastEvm.hash, "The trade");
      } else if (lastSolanaSig) {
        await confirmSolanaSignature(lastSolanaSig);
      }
    },
    [evmSend, sendSponsored]
  );
}
