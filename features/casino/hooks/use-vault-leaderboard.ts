"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePrices } from "@/hooks/use-prices";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { fetchAllVaultWinners } from "@/features/casino/lib/vault-api";
import {
  buildLeaderboard,
  type LeaderboardEntry,
} from "@/features/casino/lib/last-standing/leaderboard";

// The board only changes when a game settles, and the walk behind it is
// cached server-side for the same minute. No refetch on focus: a reader
// switching tabs is not a reason to re-rank 244 wallets.
const STALE_MS = 60_000;

export interface VaultLeaderboard {
  rows: LeaderboardEntry[];
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

/**
 * Every wallet that has ever won, ranked by total winnings.
 *
 * Gated on `enabled` so the lobby pays for nothing until the board's tab is
 * actually opened.
 */
export function useVaultLeaderboard(enabled = true): VaultLeaderboard {
  const ethPriceUsd = usePrices(["ETH"])["ETH"] ?? 0;

  const query = useQuery({
    queryKey: VAULT_KEYS.leaderboard,
    queryFn: fetchAllVaultWinners,
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Re-ranked only when the rows or the price actually change, so an unrelated
  // render does not re-sort the whole board.
  const rows = useMemo(
    () => buildLeaderboard(query.data ?? [], ethPriceUsd),
    [query.data, ethPriceUsd]
  );

  return {
    rows,
    loading: query.isPending && enabled,
    error: query.isError,
    refetch: () => void query.refetch(),
  };
}
