"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  fetchChessLeaderboard,
  fetchChessLeaderboardCountries,
  fetchChessLeaderboardRules,
  fetchChessPlayerRatingChart,
  fetchChessPlayerRatings,
  fetchChessPlayerRatingStats,
  fetchChessRatingPoolStats,
} from "@/features/casino/lib/api/chess-ratings";
import type { ChessLeaderboardPerfKey, ChessPlayerPerf } from "@/features/casino/lib/api/types";

const PAGE_SIZE = 25;
const CACHE_VERSION = "stable-100-v2";
const LIVE_REFRESH_MS = 5_000;

function preferredLeaderboardPerf(
  items: ChessPlayerPerf[] | undefined
): ChessLeaderboardPerfKey | null {
  const played = (items ?? [])
    .filter(
      (item): item is ChessPlayerPerf & { perfKey: ChessLeaderboardPerfKey } =>
        item.perfKey !== "standard" && item.games > 0
    )
    .sort((left, right) => {
      const latestDifference =
        Date.parse(right.latestAt ?? "1970-01-01") - Date.parse(left.latestAt ?? "1970-01-01");
      return latestDifference || right.games - left.games;
    });
  return played[0]?.perfKey ?? null;
}

export const CHESS_LEADERBOARD_KEYS = {
  list: (perf: ChessLeaderboardPerfKey, country: string | null, page: number) =>
    ["casino", "chess", "leaderboard", CACHE_VERSION, perf, country ?? "global", page] as const,
  countries: (perf: ChessLeaderboardPerfKey) =>
    ["casino", "chess", "leaderboard", CACHE_VERSION, perf, "countries"] as const,
  pool: (perf: ChessLeaderboardPerfKey, country: string | null) =>
    ["casino", "chess", "leaderboard", CACHE_VERSION, perf, country ?? "global", "stats"] as const,
  rules: ["casino", "chess", "leaderboard", CACHE_VERSION, "rules"] as const,
  player: (player: string, perf: ChessLeaderboardPerfKey) =>
    ["casino", "chess", "ratings", CACHE_VERSION, player, perf, "stats"] as const,
  chart: (player: string, perf: ChessLeaderboardPerfKey) =>
    ["casino", "chess", "ratings", CACHE_VERSION, player, perf, "chart", "30d"] as const,
};

export function useChessLeaderboard() {
  const wallet = useCasinoWallet();
  const [selectedPerf, setSelectedPerf] = useState<ChessLeaderboardPerfKey | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const player = wallet.address;
  const playerRatings = useQuery({
    queryKey: ["casino", "chess", "ratings", CACHE_VERSION, player ?? "none"],
    queryFn: () => fetchChessPlayerRatings(player as string),
    enabled: !!player,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const perf = selectedPerf ?? preferredLeaderboardPerf(playerRatings.data?.items) ?? "rapid";

  const leaderboard = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.list(perf, country, page),
    queryFn: () => fetchChessLeaderboard({ perf, country, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: LIVE_REFRESH_MS,
  });
  const countries = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.countries(perf),
    queryFn: () => fetchChessLeaderboardCountries(perf),
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: LIVE_REFRESH_MS,
  });
  const pool = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.pool(perf, country),
    queryFn: () => fetchChessRatingPoolStats(perf, country),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: LIVE_REFRESH_MS,
  });
  const rules = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.rules,
    queryFn: fetchChessLeaderboardRules,
    staleTime: 5 * 60_000,
  });
  const playerStats = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.player(player ?? "none", perf),
    queryFn: () => fetchChessPlayerRatingStats(player as string, perf),
    enabled: !!player,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: LIVE_REFRESH_MS,
  });
  const playerChart = useQuery({
    queryKey: CHESS_LEADERBOARD_KEYS.chart(player ?? "none", perf),
    queryFn: () => fetchChessPlayerRatingChart(player as string, perf, "30d"),
    enabled: !!player,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: LIVE_REFRESH_MS,
  });

  return {
    perf,
    country,
    page,
    leaderboard: leaderboard.data,
    countries: countries.data,
    pool: pool.data,
    rules: rules.data,
    playerStats: playerStats.data,
    playerChart: playerChart.data,
    isLoading: leaderboard.isLoading,
    isRefreshing: leaderboard.isFetching && !leaderboard.isLoading,
    error: leaderboard.error,
    selectPerf(next: ChessLeaderboardPerfKey) {
      setSelectedPerf(next);
      setCountry(null);
      setPage(1);
    },
    selectCountry(next: string | null) {
      setCountry(next);
      setPage(1);
    },
    previousPage() {
      setPage((current) => Math.max(1, current - 1));
    },
    nextPage() {
      if (leaderboard.data?.hasMore) setPage((current) => current + 1);
    },
    refetch: leaderboard.refetch,
  };
}
