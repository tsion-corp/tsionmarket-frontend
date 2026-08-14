"use client";

import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import {
  fetchVaultActivities,
  fetchVaultWinners,
  type VaultActivity,
  type VaultWinner,
} from "@/features/casino/lib/vault-api";

const FALLBACK_FEED_POLL_MS = 15_000;
const EMPTY_ACTIVITIES: VaultActivity[] = [];
const EMPTY_WINNERS: VaultWinner[] = [];

/**
 * The two feeds that span every game: recent plays and recent settlements.
 *
 * Shared by the lobby and a single game screen. Both mount it, and because the
 * query keys match, react-query serves one request between them rather than
 * two. `connected` comes from the caller's socket so the polls stop while the
 * socket is carrying the same data.
 */
export function useVaultFeeds(connected: boolean) {
  const activities = useQuery<VaultActivity[]>({
    queryKey: VAULT_KEYS.activities,
    queryFn: fetchVaultActivities,
    staleTime: 5_000,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });

  const winners = useQuery<VaultWinner[]>({
    queryKey: VAULT_KEYS.winners,
    queryFn: fetchVaultWinners,
    staleTime: 60_000,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });

  return {
    activities: activities.data ?? EMPTY_ACTIVITIES,
    winners: winners.data ?? EMPTY_WINNERS,
    winnersLoading: winners.isPending,
  };
}
