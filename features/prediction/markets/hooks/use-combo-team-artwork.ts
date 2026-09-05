"use client";

import { useQueries } from "@tanstack/react-query";
import { fetchComboTeams } from "../api";
import { COMBO_TEAM_GC_TIME, COMBO_TEAM_STALE_TIME } from "../cache-policy";
import type { ComboEvent } from "../api";
import { mergeTeamArtwork } from "../merge-team-artwork";

const TEAM_BATCH_SIZE = 40;

export function useComboTeamArtwork(events: ComboEvent[]): ComboEvent[] {
  const names = [
    ...new Set(events.flatMap((event) => event.teams.map((team) => team.name))),
  ].filter(Boolean);
  const batches = Array.from({ length: Math.ceil(names.length / TEAM_BATCH_SIZE) }, (_, index) =>
    names.slice(index * TEAM_BATCH_SIZE, (index + 1) * TEAM_BATCH_SIZE)
  );
  const queries = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ["prediction-combo-team-artwork", batch],
      queryFn: () => fetchComboTeams(batch),
      staleTime: COMBO_TEAM_STALE_TIME,
      gcTime: COMBO_TEAM_GC_TIME,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });
  const artwork = queries.flatMap((query) => query.data ?? []);

  return mergeTeamArtwork(events, artwork);
}
