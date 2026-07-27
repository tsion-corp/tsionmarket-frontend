"use client";

import { useCallback, useState } from "react";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { getWalletAddress } from "@/lib/user";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";

// The Last Standing vault contract lives on Base only.
const VAULT_CHAIN_ID = base.id;

const VAULT_ABI = [
  {
    type: "function",
    name: "entryFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "wager", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

function contractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}

// Reads entryFee() straight from the contract so the wagered amount is
// always exact, even if the REST/socket status is a beat stale.
export async function readVaultEntryFee(): Promise<bigint> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  return client.readContract({
    address: contractAddress(),
    abi: VAULT_ABI,
    functionName: "entryFee",
  });
}

// wager()/claim() are signed by the user's own embedded wallet — the backend
// never holds keys or signs on their behalf. Both wait for on-chain
// confirmation so the caller's balance/status refetch reflects the result.
export function useVaultActions() {
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const [wagering, setWagering] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const wager = useCallback(async (): Promise<string> => {
    const owner = getWalletAddress(user, "ethereum");
    if (!owner) throw new Error("No EVM wallet is connected.");
    setWagering(true);
    try {
      const client = publicClientForChain(VAULT_CHAIN_ID);
      const entryFee = await readVaultEntryFee();
      const { hash } = await sendTransaction(
        {
          to: contractAddress(),
          data: encodeFunctionData({ abi: VAULT_ABI, functionName: "wager" }),
          value: `0x${entryFee.toString(16)}` as `0x${string}`,
          chainId: VAULT_CHAIN_ID,
        },
        { address: owner }
      );
      await awaitReceipt(client, hash, "Your wager");
      return hash;
    } finally {
      setWagering(false);
    }
  }, [user, sendTransaction]);

  const claim = useCallback(async (): Promise<string> => {
    const owner = getWalletAddress(user, "ethereum");
    if (!owner) throw new Error("No EVM wallet is connected.");
    setClaiming(true);
    try {
      const client = publicClientForChain(VAULT_CHAIN_ID);
      const { hash } = await sendTransaction(
        {
          to: contractAddress(),
          data: encodeFunctionData({ abi: VAULT_ABI, functionName: "claim" }),
          chainId: VAULT_CHAIN_ID,
        },
        { address: owner }
      );
      await awaitReceipt(client, hash, "Your claim");
      return hash;
    } finally {
      setClaiming(false);
    }
  }, [user, sendTransaction]);

  return { wager, wagering, claim, claiming };
}
