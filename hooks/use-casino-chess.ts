"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptChallenge,
  cancelMatchmaking,
  createChallenge,
  fetchLiveMatches,
  fetchMatch,
  fetchMatchmakingTicket,
  fetchOpenChallenges,
  offerDraw,
  resignMatch,
  submitMove,
} from "@/lib/casino/api/chess";
import type { ChessColor, ChessMatch, CreateChessChallengeInput } from "@/lib/casino/api/types";

// While the socket is down these polls are the live path, so they run faster
// than the vault's: a chess clock is visibly wrong within a couple of seconds.
const MATCH_POLL_MS = 2_000;
const LOBBY_POLL_MS = 10_000;
const TICKET_POLL_MS = 3_000;

export const CHESS_KEYS = {
  challenges: ["casino", "chess", "challenges"] as const,
  liveMatches: ["casino", "chess", "live"] as const,
  match: (id: string) => ["casino", "chess", "match", id] as const,
  ticket: (id: string) => ["casino", "chess", "ticket", id] as const,
};

export function useChessLobby() {
  const challenges = useQuery({
    queryKey: CHESS_KEYS.challenges,
    queryFn: fetchOpenChallenges,
    refetchInterval: LOBBY_POLL_MS,
  });
  const live = useQuery({
    queryKey: CHESS_KEYS.liveMatches,
    queryFn: fetchLiveMatches,
    refetchInterval: LOBBY_POLL_MS,
  });

  return {
    challenges: challenges.data ?? [],
    liveMatches: live.data ?? [],
    isLoading: challenges.isLoading || live.isLoading,
    error: challenges.error ?? live.error,
    refetch: () => {
      void challenges.refetch();
      void live.refetch();
    },
  };
}

// Locally ticks the clock of whoever is to move, between server frames. The
// server remains the authority: every frame resets this to its value, so the
// local tick only smooths the display and never decides a flag fall.
function useTickingClocks(match: ChessMatch | undefined) {
  const [clocks, setClocks] = useState<Record<ChessColor, number> | null>(null);
  const serverStampRef = useRef<string | null>(null);

  useEffect(() => {
    if (!match) return;
    if (serverStampRef.current !== match.clockUpdatedAt) {
      serverStampRef.current = match.clockUpdatedAt;
      setClocks(match.clocks);
    }
  }, [match]);

  useEffect(() => {
    if (!match || match.state !== "in_progress") return;
    const id = setInterval(() => {
      setClocks((c) => (c ? { ...c, [match.turn]: Math.max(0, c[match.turn] - 1) } : c));
    }, 1000);
    return () => clearInterval(id);
  }, [match]);

  return clocks ?? match?.clocks ?? null;
}

// One live match. The board, clocks and result all come from the server; the
// client submits intended moves and renders whatever comes back.
export function useChessMatch(matchId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: CHESS_KEYS.match(matchId ?? "none"),
    queryFn: () => fetchMatch(matchId as string),
    enabled: !!matchId,
    refetchInterval: (q) =>
      q.state.data && q.state.data.state !== "in_progress" ? false : MATCH_POLL_MS,
  });

  const match = query.data;
  const clocks = useTickingClocks(match);

  const applyMatch = useCallback(
    (next: ChessMatch) => queryClient.setQueryData(CHESS_KEYS.match(next.id), next),
    [queryClient]
  );

  const move = useMutation({
    mutationFn: (uci: string) => submitMove(matchId as string, uci),
    onSuccess: applyMatch,
  });

  const resign = useMutation({
    mutationFn: () => resignMatch(matchId as string),
    onSuccess: applyMatch,
  });

  const proposeDraw = useMutation({
    mutationFn: () => offerDraw(matchId as string),
    onSuccess: applyMatch,
  });

  return {
    match,
    clocks,
    isLoading: query.isLoading,
    error: query.error,
    submitMove: move.mutateAsync,
    moving: move.isPending,
    moveError: move.error,
    resign: resign.mutateAsync,
    resigning: resign.isPending,
    offerDraw: proposeDraw.mutateAsync,
    offeringDraw: proposeDraw.isPending,
  };
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChessChallengeInput) => createChallenge(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

export function useAcceptChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) => acceptChallenge(challengeId),
    onSuccess: (match) => {
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

// Polls a matchmaking ticket until the server pairs the player or the ticket
// expires.
export function useMatchmakingTicket(ticketId: string | null) {
  const query = useQuery({
    queryKey: CHESS_KEYS.ticket(ticketId ?? "none"),
    queryFn: () => fetchMatchmakingTicket(ticketId as string),
    enabled: !!ticketId,
    refetchInterval: (q) => (q.state.data?.state === "searching" ? TICKET_POLL_MS : false),
  });

  return {
    ticket: query.data,
    isLoading: query.isLoading,
    error: query.error,
    cancel: () => (ticketId ? cancelMatchmaking(ticketId) : Promise.resolve()),
  };
}
