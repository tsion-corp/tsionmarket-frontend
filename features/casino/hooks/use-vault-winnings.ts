"use client";

import { useQuery } from "@tanstack/react-query";
import { base } from "viem/chains";
import { publicClientForChain } from "@/lib/trade/receipt";
import { KING_OF_NIGHT_ABI } from "@/features/casino/lib/last-standing/king-of-night-abi";

// Settlement pushes each payout straight to the wallet. Only a transfer that
// fails is credited to pendingWithdrawals[address], and that is what claim()
// collects. Reading it from the contract is the source of truth for "is there
// anything left to collect", independent of any backend lag. This read used to
// call pendingWinnings(), a v3 name that v4 does not have, so it always
// failed and the claim path could never fire.

function vaultAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  return address ? (address as `0x${string}`) : null;
}

// This wallet's uncollected payout in the vault, in wei. Re-read on each new
// block via useInvalidateOnBlock(["vault-winnings"]) so it clears within ~2s of
// a claim landing. Returns 0n while loading or when nothing is claimable.
export function useVaultPendingWinnings(address: string | null) {
  const contract = vaultAddress();
  const query = useQuery<bigint>({
    queryKey: ["vault-winnings", address],
    enabled: !!address && !!contract,
    staleTime: 4000,
    queryFn: () =>
      publicClientForChain(base.id).readContract({
        address: contract as `0x${string}`,
        abi: KING_OF_NIGHT_ABI,
        functionName: "pendingWithdrawals",
        args: [address as `0x${string}`],
      }),
  });
  return { pendingWei: query.data ?? 0n, refetch: query.refetch, isPending: query.isPending };
}
