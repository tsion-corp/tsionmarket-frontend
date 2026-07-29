"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });

// The vault holds each winner's pot in pendingWinnings[address] until they call
// claim(); it is not auto-credited. Reading it straight from the contract is
// the source of truth for "what can I collect", independent of any backend lag.
const VAULT_ABI = [
  {
    type: "function",
    name: "pendingWinnings",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function vaultAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  return address ? (address as `0x${string}`) : null;
}

// This wallet's unclaimed winnings in the vault, in wei. Re-read on each new
// block via useInvalidateOnBlock(["vault-winnings"]) so it clears within ~2s of
// a claim landing. Returns 0n while loading or when nothing is claimable.
export function useVaultPendingWinnings(address: string | null) {
  const contract = vaultAddress();
  const query = useQuery<bigint>({
    queryKey: ["vault-winnings", address],
    enabled: !!address && !!contract,
    staleTime: 4000,
    queryFn: () =>
      client.readContract({
        address: contract as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "pendingWinnings",
        args: [address as `0x${string}`],
      }),
  });
  return { pendingWei: query.data ?? 0n, refetch: query.refetch, isPending: query.isPending };
}
