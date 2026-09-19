"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCasinoPresence, indexCasinoPresence } from "@/features/casino/lib/api/presence";

export const CASINO_PRESENCE_KEY = ["casino", "presence"] as const;

export function useCasinoPresence() {
  return useQuery({
    queryKey: CASINO_PRESENCE_KEY,
    queryFn: fetchCasinoPresence,
    select: indexCasinoPresence,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
