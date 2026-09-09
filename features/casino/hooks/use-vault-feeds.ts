"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { mergeActivities, mergeWinners } from "@/features/casino/lib/last-standing/merge-feeds";
import {
  readRecentActivity,
  readSettledGames,
  type ChainActivity,
  type ChainSettledGame,
} from "@/features/casino/hooks/use-vault-actions";
import { usePrices } from "@/hooks/use-prices";
import {
  fetchVaultActivities,
  fetchVaultWinners,
  type VaultActivity,
  type VaultWinner,
} from "@/features/casino/lib/vault-api";

const FALLBACK_FEED_POLL_MS = 15_000;
// The chain is the source of truth for what has settled and what has started.
// It is polled while the socket is down; while the socket is up its frames
// carry every start, join and settlement, and a settlement invalidates the
// settled read (ADR-2026-09-09-last-man-lobby-reads).
const CHAIN_POLL_MS = 12_000;
const WINNERS_STALE_MS = 5 * 60_000;
const EMPTY_ACTIVITIES: VaultActivity[] = [];
const EMPTY_WINNERS: VaultWinner[] = [];
const EMPTY_SETTLED: ChainSettledGame[] = [];
const EMPTY_CHAIN_ACTIVITY: ChainActivity[] = [];

/**
 * The two feeds that span every game: recent plays and recent settlements.
 *
 * Shared by the lobby and a single game screen. Both mount it, and because the
 * query keys match, react-query serves one request between them rather than
 * two. `connected` comes from the caller's socket so the polls stop while the
 * socket is carrying the same data.
 */
export function useVaultFeeds(
  connected: boolean,
  gameId?: number,
  // Which feeds the caller renders. The lobby shows winners only inside its
  // history modal and no activity strip; a game page shows both.
  wanted: { activity?: boolean; winners?: boolean } = {}
) {
  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
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

  const settledOnChain = useQuery<ChainSettledGame[]>({
    queryKey: VAULT_KEYS.chainSettled,
    queryFn: readSettledGames,
    enabled: wantWinners,
    staleTime: connected ? WINNERS_STALE_MS : CHAIN_POLL_MS,
    refetchInterval: connected ? false : CHAIN_POLL_MS,
  });

  const activityOnChain = useQuery<ChainActivity[]>({
    queryKey: VAULT_KEYS.chainActivity,
    queryFn: readRecentActivity,
    enabled: wantActivity,
    staleTime: CHAIN_POLL_MS,
    refetchInterval: connected ? false : CHAIN_POLL_MS,
  });

  const mergedWinners = useMemo(
    () =>
      mergeWinners(winners.data ?? EMPTY_WINNERS, settledOnChain.data ?? EMPTY_SETTLED, ethPrice),
    [winners.data, settledOnChain.data, ethPrice]
  );
  const mergedActivities = useMemo(
    () =>
      mergeActivities(
        activities.data ?? EMPTY_ACTIVITIES,
        activityOnChain.data ?? EMPTY_CHAIN_ACTIVITY
      ),
    [activities.data, activityOnChain.data]
  );

  // A game's own page shows that game: its plays and its result. Without a
  // gameId the feeds span every game, which is what the lobby's history is.
  const scopedWinners = useMemo(
    () => (gameId == null ? mergedWinners : mergedWinners.filter((w) => w.gameId === gameId)),
    [mergedWinners, gameId]
  );
  const scopedActivities = useMemo(
    () => (gameId == null ? mergedActivities : mergedActivities.filter((a) => a.gameId === gameId)),
    [mergedActivities, gameId]
  );

  return {
    activities: scopedActivities,
    winners: scopedWinners,
    winnersLoading: winners.isPending && settledOnChain.isPending,
  };
}
