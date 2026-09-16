"use client";

import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { fetchVaultPlayer } from "@/features/casino/lib/vault-api";
import type { TokenAmount } from "@/features/casino/lib/vault-api";

// Settlement pushes each payout straight to the wallet. Only a transfer that
// fails is credited to pendingWithdrawals[token][account], and that is what
// claim(token) collects. The service reads it from the contract on every call,
// so it is the source of truth for "is there anything left to collect" without
// the browser making a contract read of its own.
//
// From v5 on this is a LIST, because a wallet can be owed in more than one
// asset at once. The service still sends `pendingWei` as the native entry for
// older clients, and a USDC payout never appears in it — so reading only that
// field is how a player would be shown nothing while being owed something.
//
// Read on events, not on blocks: once when the page mounts with a wallet, and
// again when the caller learns a settlement named this wallet or its own settle
// or claim confirmed. It used to follow every Base block, which was six
// contract reads a minute for a value that changes once a round at most.

export interface PendingPayout {
  token: string;
  amount: TokenAmount;
  raw: bigint;
}

function pendingOf(player: Awaited<ReturnType<typeof fetchVaultPlayer>>): PendingPayout[] {
  const rows = player.pendingByAsset ?? [];
  const list = rows.length > 0 ? rows : player.pending ? [player.pending] : [];
  return list
    .map((amount) => ({
      token: amount.token ?? "0x0000000000000000000000000000000000000000",
      amount,
      raw: (() => {
        try {
          return BigInt(amount.raw ?? "0");
        } catch {
          return 0n;
        }
      })(),
    }))
    .filter((row) => row.raw > 0n);
}

/** Every asset this wallet is owed in the vault. Empty while loading or when nothing is claimable. */
export function useVaultPendingWinnings(address: string | null) {
  const query = useQuery<PendingPayout[]>({
    queryKey: VAULT_KEYS.winnings(address ?? ""),
    enabled: !!address,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => pendingOf(await fetchVaultPlayer(address as string)),
  });
  const pending = query.data ?? [];
  return {
    pending,
    /** True when anything at all is owed, in any asset. */
    hasPending: pending.length > 0,
    refetch: query.refetch,
    isPending: query.isPending,
  };
}
