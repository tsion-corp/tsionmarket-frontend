"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { issueMatchVideoToken } from "@/features/casino/lib/api/chess";

const DESKTOP_VIDEO_QUERY = "(min-width: 900px)";

function desktopVideoLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_VIDEO_QUERY).matches;
}

export function useDesktopVideoLayout(): boolean {
  const [desktop, setDesktop] = useState(desktopVideoLayout);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_VIDEO_QUERY);
    const sync = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return desktop;
}

export function useLiveVideoAccess({
  matchId,
  player,
  autoConnect,
}: {
  matchId: string;
  player?: string;
  autoConnect: boolean;
}) {
  const queryClient = useQueryClient();
  const requestKey = `${matchId}:${player ?? "spectator"}`;
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const queryKey = ["casino", "chess", "video", matchId, player ?? "spectator"] as const;
  const requested = autoConnect || requestedKey === requestKey;

  const query = useQuery({
    queryKey,
    queryFn: () => issueMatchVideoToken(matchId, player),
    enabled: Boolean(matchId) && requested,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
  });

  const leave = () => {
    setRequestedKey(null);
    queryClient.removeQueries({ queryKey, exact: true });
  };

  return {
    access: query.data ?? null,
    connect: () => setRequestedKey(requestKey),
    leave,
    isLoading: query.isLoading || query.isFetching,
    error: query.error,
    retry: query.refetch,
  };
}
