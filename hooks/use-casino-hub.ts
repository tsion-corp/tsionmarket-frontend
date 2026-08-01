"use client";

import { useQuery } from "@tanstack/react-query";
import { isCasinoUnconfigured } from "@/lib/casino/api/client";
import { fetchGamePresence, fetchRecentWins } from "@/lib/casino/api/hub";

const WINS_POLL_MS = 20_000;
const PRESENCE_POLL_MS = 15_000;

export const HUB_KEYS = {
  wins: ["casino", "hub", "recent-wins"] as const,
  presence: ["casino", "hub", "presence"] as const,
};

// An unconfigured gateway answers the same 503 forever — stop polling and
// retrying it; transient failures keep the normal cadence.
const noRetryWhenUnconfigured = (failureCount: number, error: unknown) =>
  !isCasinoUnconfigured(error) && failureCount < 2;

// Hub-level live state. Both reads are public, so the hub still renders for a
// signed-out visitor browsing the games.
export function useCasinoHub() {
  const wins = useQuery({
    queryKey: HUB_KEYS.wins,
    queryFn: () => fetchRecentWins(),
    refetchInterval: (q) => (isCasinoUnconfigured(q.state.error) ? false : WINS_POLL_MS),
    retry: noRetryWhenUnconfigured,
  });

  const presence = useQuery({
    queryKey: HUB_KEYS.presence,
    queryFn: fetchGamePresence,
    refetchInterval: (q) => (isCasinoUnconfigured(q.state.error) ? false : PRESENCE_POLL_MS),
    retry: noRetryWhenUnconfigured,
  });

  // No loading/error surface: the hub always lists the catalogue and simply
  // renders without live figures until these answer.
  return {
    recentWins: wins.data ?? [],
    presence: presence.data ?? [],
  };
}
