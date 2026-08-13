"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchChessPlayerRatings,
  fetchChessRatingHistory,
} from "@/features/casino/lib/api/chess-ratings";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import type { ChessPerfKey } from "@/features/casino/lib/api/types";

export const CHESS_RATING_KEYS = {
  current: (player: string) => ["casino", "chess", "ratings", player] as const,
  history: (player: string, perf: ChessPerfKey) =>
    ["casino", "chess", "ratings", player, perf, "history"] as const,
};

export function useChessRatings() {
  const wallet = useCasinoWallet();
  const [selectedPerf, setSelectedPerf] = useState<ChessPerfKey>("standard");
  const player = wallet.address;
  const current = useQuery({
    queryKey: CHESS_RATING_KEYS.current(player ?? "none"),
    queryFn: () => fetchChessPlayerRatings(player as string),
    enabled: !!player,
    staleTime: 30_000,
  });
  const history = useQuery({
    queryKey: CHESS_RATING_KEYS.history(player ?? "none", selectedPerf),
    queryFn: () => fetchChessRatingHistory(player as string, selectedPerf),
    enabled: !!player,
    staleTime: 30_000,
  });

  return {
    ratings: current.data?.items ?? [],
    history: history.data?.items ?? [],
    selectedPerf,
    selectPerf: setSelectedPerf,
    isLoading: current.isLoading || history.isLoading,
    error: current.error ?? history.error,
  };
}
