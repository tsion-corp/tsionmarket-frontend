"use client";

import { chessGet } from "@/features/casino/lib/api/chess-client";
import type {
  ChessLeaderboard,
  ChessLeaderboardCountries,
  ChessLeaderboardPerfKey,
  ChessLeaderboardRules,
  ChessPerfKey,
  ChessPlayerRatingChart,
  ChessPlayerRatingStats,
  ChessPlayerRatings,
  ChessRatingChartRange,
  ChessRatingHistory,
  ChessRatingPoolStats,
} from "@/features/casino/lib/api/types";

export function fetchChessPlayerRatings(player: string): Promise<ChessPlayerRatings> {
  return chessGet<ChessPlayerRatings>(`/players/${encodeURIComponent(player)}/ratings`);
}

export function fetchChessRatingHistory(
  player: string,
  perfKey: ChessPerfKey,
  limit = 50
): Promise<ChessRatingHistory> {
  return chessGet<ChessRatingHistory>(
    `/players/${encodeURIComponent(player)}/ratings/${perfKey}/history`,
    { limit }
  );
}

export function fetchChessLeaderboard({
  perf,
  country,
  page = 1,
  limit = 25,
}: {
  perf: ChessLeaderboardPerfKey;
  country?: string | null;
  page?: number;
  limit?: number;
}): Promise<ChessLeaderboard> {
  return chessGet<ChessLeaderboard>("/leaderboard", {
    perf,
    ...(country ? { country } : {}),
    page,
    limit,
  });
}

export function fetchChessLeaderboardCountries(
  perf: ChessLeaderboardPerfKey
): Promise<ChessLeaderboardCountries> {
  return chessGet<ChessLeaderboardCountries>("/leaderboard/countries", { perf });
}

export function fetchChessRatingPoolStats(
  perf: ChessLeaderboardPerfKey,
  country?: string | null
): Promise<ChessRatingPoolStats> {
  return chessGet<ChessRatingPoolStats>("/leaderboard/stats", {
    perf,
    ...(country ? { country } : {}),
  });
}

export function fetchChessLeaderboardRules(): Promise<ChessLeaderboardRules> {
  return chessGet<ChessLeaderboardRules>("/leaderboard/rules");
}

export function fetchChessPlayerRatingStats(
  player: string,
  perf: ChessLeaderboardPerfKey
): Promise<ChessPlayerRatingStats> {
  return chessGet<ChessPlayerRatingStats>(
    `/players/${encodeURIComponent(player)}/ratings/${perf}/stats`
  );
}

export function fetchChessPlayerRatingChart(
  player: string,
  perf: ChessLeaderboardPerfKey,
  range: ChessRatingChartRange = "30d"
): Promise<ChessPlayerRatingChart> {
  return chessGet<ChessPlayerRatingChart>(
    `/players/${encodeURIComponent(player)}/ratings/${perf}/chart`,
    { range }
  );
}
