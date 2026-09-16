"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useSessionWallet } from "@/components/providers/server-session";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { fetchLiveMatches } from "@/features/casino/lib/api/chess";
import { CHESS_KEYS } from "@/features/casino/hooks/use-casino-chess";
import { LiveGameList } from "@/features/casino/components/chess/broadcast/live-game-list";

// The list is not the game transport. Individual boards receive moves over the
// chess socket, so this request only repairs the catalog when games start/end.
const LIVE_GAMES_POLL_MS = 30_000;

export function LiveGamesSection() {
  const wallet = useSessionWallet("ethereum")?.toLowerCase() ?? null;
  const channel = useSearchParams()?.get("channel") ?? "best";
  const live = useQuery({
    queryKey: CHESS_KEYS.liveMatches,
    queryFn: fetchLiveMatches,
    staleTime: LIVE_GAMES_POLL_MS,
    refetchInterval: LIVE_GAMES_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const matches = useMemo(
    () =>
      (live.data ?? []).filter(
        (match) =>
          match.state === "in_progress" && (!match.computer || match.computer.bot === true)
      ),
    [live.data]
  );
  const ownedMatchIds = useMemo(
    () =>
      new Set(
        matches
          .filter(
            (match) =>
              !!wallet &&
              (match.white?.walletAddress.toLowerCase() === wallet ||
                match.black?.walletAddress.toLowerCase() === wallet)
          )
          .map((match) => match.id)
      ),
    [matches, wallet]
  );

  if (live.isLoading) return <CasinoLoading label="Loading current games" rows={12} />;
  if (live.error) return <CasinoError error={live.error} subject="current games" onRetry={live.refetch} />;

  return <LiveGameList matches={matches} ownedMatchIds={ownedMatchIds} channelKey={channel} />;
}
