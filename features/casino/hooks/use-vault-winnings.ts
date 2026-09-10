"use client";

import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { fetchVaultPlayer } from "@/features/casino/lib/vault-api";

// Settlement pushes each payout straight to the wallet. Only a transfer that
// fails is credited to pendingWithdrawals[address], and that is what claim()
// collects. The service reads it from the contract on every call, so it is
// the source of truth for "is there anything left to collect" without the
// browser making a contract read of its own.
//
// Read on events, not on blocks: once when the page mounts with a wallet, and
// again when the caller learns a settlement named this wallet or its own
// settle or claim confirmed. It used to follow every Base block, which was
// six contract reads a minute for a value that changes once a round at most.

/** This wallet's uncollected payout in the vault, in wei. 0n while loading or when nothing is claimable. */
export function useVaultPendingWinnings(address: string | null) {
  const query = useQuery<bigint>({
    queryKey: VAULT_KEYS.winnings(address ?? ""),
    enabled: !!address,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => BigInt((await fetchVaultPlayer(address as string)).pendingWei),
  });
  return { pendingWei: query.data ?? 0n, refetch: query.refetch, isPending: query.isPending };
}
