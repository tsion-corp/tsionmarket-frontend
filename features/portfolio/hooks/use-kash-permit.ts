"use client";

import { useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { publicClientForChain } from "@/lib/trade/receipt";
import {
  buildKashPermitTypedData,
  permitDeadline,
  splitPermitSignature,
  type KashChainInfo,
  type KashPermitSignature,
} from "@/features/portfolio/lib/kash-permit";

const NONCES_ABI = [
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Signs the EIP-2612 permit a real-chain conversion needs: reads the token's
// live nonce, builds the typed payload, and has the holder's embedded wallet
// sign it. Free for the user, no transaction. Returns the split signature the
// engine forwards to token.permit().
export function useKashPermitSigner() {
  const { wallets } = useWallets();

  return useCallback(
    async (
      chain: KashChainInfo,
      owner: string,
      kashAmount: string
    ): Promise<KashPermitSignature> => {
      const wallet = wallets.find((w) => w.address.toLowerCase() === owner.toLowerCase());
      if (!wallet) throw new Error("Signing wallet is not connected.");

      const client = publicClientForChain(chain.chainId);
      const nonce = await client.readContract({
        address: chain.tokenAddress as `0x${string}`,
        abi: NONCES_ABI,
        functionName: "nonces",
        args: [owner as `0x${string}`],
      });

      const deadline = permitDeadline(Date.now());
      const typedData = buildKashPermitTypedData({ chain, owner, kashAmount, nonce, deadline });

      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      const signature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [owner as `0x${string}`, JSON.stringify(typedData)],
      })) as string;

      return splitPermitSignature(signature, deadline);
    },
    [wallets]
  );
}
