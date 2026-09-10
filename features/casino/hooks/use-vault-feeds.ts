"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import {
  fetchVaultActivities,
  fetchVaultWinners,
  type VaultActivity,
  type VaultWinner,
} from "@/features/casino/lib/vault-api";

const FALLBACK_FEED_POLL_MS = 15_000;
const WINNERS_STALE_MS = 5 * 60_000;
const EMPTY_ACTIVITIES: VaultActivity[] = [];
const EMPTY_WINNERS: VaultWinner[] = [];

/**
 * The two feeds that span every game: recent plays and recent settlements.
 *
 * Both come from the vault service alone; it indexes every start, join and
 * settlement and prices them at the time they landed. Shared by the lobby
 * and a single game screen. Both mount it, and because the query keys match,
 * react-query serves one request between them rather than two. `connected`
 * comes from the caller's socket so the polls stop while the socket is
 * carrying the same data; a `gameSettled` frame invalidates both.
 */
export function useVaultFeeds(
  connected: boolean,
  gameId?: number,
  // Which feeds the caller renders. The lobby shows winners only inside its
  // history modal and no activity strip; a game page shows both.
  wanted: { activity?: boolean; winners?: boolean } = {}
) {
  const wantActivity = wanted.activity ?? true;
  const wantWinners = wanted.winners ?? true;

  const activities = useQuery<VaultActivity[]>({
    queryKey: VAULT_KEYS.activities,
    queryFn: fetchVaultActivities,
    enabled: wantActivity,
    staleTime: 5_000,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });

  const winners = useQuery<VaultWinner[]>({
    queryKey: VAULT_KEYS.winners,
    queryFn: fetchVaultWinners,
    enabled: wantWinners,
    staleTime: WINNERS_STALE_MS,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });

  // A game's own page shows that game: its plays and its result. Without a
  // gameId the feeds span every game, which is what the lobby's history is.
  const allWinners = winners.data ?? EMPTY_WINNERS;
  const allActivities = activities.data ?? EMPTY_ACTIVITIES;
  const scopedWinners = useMemo(
    () => (gameId == null ? allWinners : allWinners.filter((w) => w.gameId === gameId)),
    [allWinners, gameId]
  );
  const scopedActivities = useMemo(
    () => (gameId == null ? allActivities : allActivities.filter((a) => a.gameId === gameId)),
    [allActivities, gameId]
  );

  return {
    activities: scopedActivities,
    winners: scopedWinners,
    winnersLoading: winners.isPending,
  };
}
