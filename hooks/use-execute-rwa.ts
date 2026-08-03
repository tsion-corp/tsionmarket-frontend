"use client";

import { useCallback } from "react";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import { awaitReceipt, isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { useEvmSend } from "@/hooks/use-evm-send";
import type { RwaAction, RwaChain, RwaStep } from "@/lib/rwa-api";

// EVM chain ids per RWA chain. Without an explicit chainId, Privy defaults to
// Ethereum mainnet (1), so a Base/Arbitrum/Polygon RWA buy would be signed on
// the wrong chain and fail with "insufficient funds for gas".
const EVM_CHAIN_ID: Partial<Record<RwaChain, number>> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  bsc: 56,
  polygon: 137,
};

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
  const evmSend = useEvmSend();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets: solanaWallets } = useWallets();

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
          const wallet = solanaWallets[0];
          if (!wallet) throw new Error("No Solana wallet is connected.");
          if (!step.tx.base64) throw new Error("The transaction is missing.");
          const { signature } = await signAndSendTransaction({
            transaction: base64ToBytes(step.tx.base64),
            wallet,
            // Return once broadcast. Privy would otherwise confirm over a
            // WebSocket subscription we do not proxy; the confirmation below
            // polls the same RPC we send through.
            options: { optimisticBroadcast: true },
          });
          lastSolanaSig = getBase58Decoder().decode(signature);
        } else {
          if (!step.tx.to) throw new Error("The transaction is missing.");
          const chainId = EVM_CHAIN_ID[step.chain];
          if (!chainId) throw new Error(`Unsupported chain for this trade: ${step.chain}`);
          // On Base this is gasless (EIP-7702 sponsored); other chains send
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
      // receipt where we have a read client (Base/Arbitrum/Polygon); other chains
      // are best-effort. Solana polls the signature status.
      if (lastEvm && isReceiptChain(lastEvm.chainId)) {
        await awaitReceipt(publicClientForChain(lastEvm.chainId), lastEvm.hash, "The trade");
      } else if (lastSolanaSig) {
        await confirmSolanaSignature(lastSolanaSig);
      }
    },
    [evmSend, signAndSendTransaction, solanaWallets]
  );
}
