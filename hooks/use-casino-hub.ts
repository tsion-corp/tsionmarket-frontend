"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGamePresence, fetchRecentWins } from "@/lib/casino/api/hub";

const WINS_POLL_MS = 20_000;
const PRESENCE_POLL_MS = 15_000;

export const HUB_KEYS = {
  wins: ["casino", "hub", "recent-wins"] as const,
  presence: ["casino", "hub", "presence"] as const,
};

// Hub-level live state. Both reads are public, so the hub still renders for a
// signed-out visitor browsing the games.
export function useCasinoHub() {
  const wins = useQuery({
    queryKey: HUB_KEYS.wins,
    queryFn: () => fetchRecentWins(),
    refetchInterval: WINS_POLL_MS,
  });

  const presence = useQuery({
    queryKey: HUB_KEYS.presence,
    queryFn: fetchGamePresence,
    refetchInterval: PRESENCE_POLL_MS,
  });

  return {
    recentWins: wins.data ?? [],
    presence: presence.data ?? [],
    isLoading: wins.isLoading || presence.isLoading,
    error: wins.error ?? presence.error,
  };
}
