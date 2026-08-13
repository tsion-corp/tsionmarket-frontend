"use client";

import { chessGet } from "@/features/casino/lib/api/chess-client";
import type {
  ChessPerfKey,
  ChessPlayerRatings,
  ChessRatingHistory,
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
