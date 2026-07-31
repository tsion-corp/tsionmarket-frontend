"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  abortMatch,
  acceptChallenge,
  cancelMatchmaking,
  claimTimeout,
  createChallenge,
  fetchJoinableMatches,
  fetchLiveMatches,
  fetchMatch,
  fetchMatchmakingTicket,
  fetchOpenChallenges,
  fetchWaitingMatches,
  claimDraw,
  offerDraw,
  requestRematch,
  resignMatch,
  respondToDraw,
  submitMove,
  fetchPlayerMatches,
} from "@/lib/casino/api/chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import type { ChessColor, ChessMatch, CreateChessChallengeInput } from "@/lib/casino/api/types";

// The chess service has no socket, so these polls are the live path. They run
// faster than the vault's: a board that is two seconds behind is visibly wrong.
const MATCH_POLL_MS = 2_000;
// The shared ws-gateway carrying every service's live frames.
const CHESS_WS_URL = process.env.NEXT_PUBLIC_CHESS_WS_URL ?? "wss://ws.worldstreetwebservices.com";
const LOBBY_POLL_MS = 10_000;
const TICKET_POLL_MS = 3_000;

// How often the displayed clock is recomputed. Four times a second keeps the
// seconds digit honest without re-rendering the board on every frame.
const CLOCK_TICK_MS = 250;

export const CHESS_KEYS = {
  challenges: ["casino", "chess", "challenges"] as const,
  liveMatches: ["casino", "chess", "live"] as const,
  match: (id: string) => ["casino", "chess", "match", id] as const,
  history: (wallet: string) => ["casino", "chess", "history", wallet] as const,
  ticket: (id: string) => ["casino", "chess", "ticket", id] as const,
};

// Every write names the player acting, so an action taken before the wallet is
// known would be rejected with a confusing message from the service.
function requireWallet(address: string | null): string {
  if (!address) throw new Error("Connect your wallet to play.");
  return address;
}

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

// The clock of whoever is to move, counted down from the last moment the server
// vouched for it.
//
// The service reports the time each side has banked but does not charge the
// mover while they think, so polling returns the same pair of numbers between
// moves. Counting down from `clockUpdatedAt` rather than resetting to the
// server value on each frame is what makes the clock move at all; the server
// stays the authority, because every move resets both the value and the
// reference point, and a flag fall is only real once the service says so.
function useTickingClocks(match: ChessMatch | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const running = match?.state === "in_progress";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  return useMemo(() => {
    if (!match) return null;
    if (match.state !== "in_progress") return match.clocks;
    const since = Date.parse(match.clockUpdatedAt);
    const elapsed = Number.isFinite(since) ? Math.max(0, (now - since) / 1000) : 0;
    return {
      ...match.clocks,
      [match.turn]: Math.max(0, match.clocks[match.turn] - elapsed),
    } as Record<ChessColor, number>;
  }, [match, now]);
}

// One live match. The board, clocks and result all come from the server; the
// client submits intended moves and renders whatever comes back.
export function useChessMatch(matchId: string | null) {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();

  const query = useQuery({
    queryKey: CHESS_KEYS.match(matchId ?? "none"),
    queryFn: () => fetchMatch(matchId as string),
    enabled: !!matchId,
    refetchInterval: (q) =>
      q.state.data && q.state.data.state !== "in_progress" ? false : MATCH_POLL_MS,
  });

  const match = query.data;
  const clocks = useTickingClocks(match);

  // Live-frame accelerator: the service publishes state/position/gameOver
  // frames to the ws-gateway on the match's liveTopic. When a frame arrives
  // the match refetches immediately instead of waiting for the next poll —
  // and the poll stays as the fallback, because the relay is not publishing
  // in production yet (verified: subscribe acks, zero frames). This is silent
  // until the backend wires it, then moves become realtime with no change.
  const liveTopic = match?.liveTopic ?? null;
  const inProgress = match?.state === "in_progress";
  useEffect(() => {
    if (!liveTopic || !inProgress || !matchId) return;
    let ws: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectDelay = 2_000;

    const open = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(CHESS_WS_URL);
      } catch {
        // A malformed URL throws synchronously; the poll carries the game.
        return;
      }
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "subscribe", topics: [liveTopic] }));
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };
      ws.onmessage = (event) => {
        let frame: { type?: string };
        try {
          frame = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (frame.type === "state" || frame.type === "position" || frame.type === "gameOver") {
          reconnectDelay = 2_000;
          void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
        }
      };
      ws.onclose = () => {
        if (pingTimer != null) clearInterval(pingTimer);
        pingTimer = null;
        if (!disposed) {
          reconnectTimer = setTimeout(open, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        }
      };
      ws.onerror = () => {};
    };

    open();
    return () => {
      disposed = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      if (pingTimer != null) clearInterval(pingTimer);
      ws?.close();
    };
  }, [liveTopic, inProgress, matchId, queryClient]);

  const applyMatch = useCallback(
    (next: ChessMatch) => queryClient.setQueryData(CHESS_KEYS.match(next.id), next),
    [queryClient]
  );

  const you: ChessColor | null = !match
    ? null
    : match.white?.walletAddress?.toLowerCase() === wallet.address?.toLowerCase()
      ? "w"
      : match.black?.walletAddress?.toLowerCase() === wallet.address?.toLowerCase()
        ? "b"
        : null;

  const move = useMutation({
    mutationFn: (uci: string) =>
      submitMove(matchId as string, uci, requireWallet(wallet.address), match?.moves ?? []),
    onSuccess: applyMatch,
  });

  const resign = useMutation({
    mutationFn: () => resignMatch(matchId as string, requireWallet(wallet.address)),
    onSuccess: applyMatch,
  });

  const proposeDraw = useMutation({
    mutationFn: () => offerDraw(matchId as string, requireWallet(wallet.address)),
    onSuccess: applyMatch,
  });

  const answerDraw = useMutation({
    mutationFn: (accept: boolean) =>
      respondToDraw(matchId as string, requireWallet(wallet.address), accept),
    onSuccess: applyMatch,
  });

  const abort = useMutation({
    mutationFn: () => abortMatch(matchId as string, requireWallet(wallet.address)),
    onSuccess: applyMatch,
  });

  // Threefold repetition and the fifty-move rule are claimed, never automatic;
  // the service arbitrates the claim and rejects it when neither holds.
  const drawClaim = useMutation({
    mutationFn: () => claimDraw(matchId as string, requireWallet(wallet.address)),
    onSuccess: applyMatch,
  });

  const rematch = useMutation({
    mutationFn: () => requestRematch(matchId as string, requireWallet(wallet.address)),
    onSuccess: (next) => applyMatch(next),
  });

  const flag = useMutation({
    mutationFn: () => claimTimeout(matchId as string, requireWallet(wallet.address)),
    onSuccess: applyMatch,
  });

  // The service does not end a game when a clock runs out, so the player who is
  // still on the move has to claim it. Only the opponent of the flagged side
  // claims, and only once per match: a repeated claim would be rejected, and
  // the poll would keep re-triggering it.
  const claimedRef = useRef<string | null>(null);
  const opponentFlagged =
    !!match &&
    match.state === "in_progress" &&
    you !== null &&
    match.turn !== you &&
    (clocks?.[match.turn] ?? 1) <= 0;

  const claimMutate = flag.mutate;
  useEffect(() => {
    if (!opponentFlagged || !match) return;
    if (claimedRef.current === match.id) return;
    claimedRef.current = match.id;
    claimMutate();
  }, [opponentFlagged, match, claimMutate]);

  return {
    match,
    clocks,
    you,
    isLoading: query.isLoading,
    error: query.error,
    submitMove: move.mutateAsync,
    moving: move.isPending,
    moveError: move.error,
    resign: resign.mutateAsync,
    resigning: resign.isPending,
    offerDraw: proposeDraw.mutateAsync,
    offeringDraw: proposeDraw.isPending,
    respondToDraw: answerDraw.mutateAsync,
    respondingToDraw: answerDraw.isPending,
    claimDraw: drawClaim.mutateAsync,
    claimingDraw: drawClaim.isPending,
    abort: abort.mutateAsync,
    aborting: abort.isPending,
    rematch: rematch.mutateAsync,
    requestingRematch: rematch.isPending,
    claimingTimeout: flag.isPending,
  };
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  return useMutation({
    mutationFn: (input: CreateChessChallengeInput) =>
      createChallenge({ ...input, creator: requireWallet(wallet.address) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

export function useAcceptChallenge() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  return useMutation({
    mutationFn: (challengeId: string) =>
      acceptChallenge(challengeId, requireWallet(wallet.address)),
    onSuccess: (match) => {
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

// Pairs the player with someone already waiting, or opens a game for someone
// else to join.
//
// There is no queue on this service, so quick match is the lobby read the
// player would otherwise do by hand: take the oldest game nobody has joined and
// join it. Another player can take the same seat first, which is a race we lose
// by trying the next game rather than by failing.
const QUICK_MATCH_ATTEMPTS = 3;

export function useQuickMatch() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();

  return useMutation({
    // Resolves to the match to open when a seat was free, or the game the
    // player now waits on when there was not.
    mutationFn: async (
      input: CreateChessChallengeInput
    ): Promise<{ matchId: string | null; waitingOn: string | null }> => {
      const address = requireWallet(wallet.address);
      const waiting = await fetchJoinableMatches(address);
      const oldest = [...waiting].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      for (const candidate of oldest.slice(0, QUICK_MATCH_ATTEMPTS)) {
        try {
          const match = await acceptChallenge(candidate.id, address);
          return { matchId: match.id, waitingOn: null };
        } catch {
          // Somebody else took the seat between the list and the join. Try the
          // next one; if they all go, we open our own game below.
          continue;
        }
      }

      const { challenge } = await createChallenge({ ...input, creator: address });
      return { matchId: null, waitingOn: challenge.id };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

// Watches for the opponent opening a rematch.
//
// The service's rematch is not an invitation: it opens a brand new game seating
// only the caller, with the colours swapped, and the other player is never told.
// If both pressed it they would sit in two separate empty games. So once a game
// is over the loser of the race watches the waiting list for a game their last
// opponent has just opened, and joins that one instead of opening a third.
const REMATCH_POLL_MS = 3_000;

export function useRematchOffer(match: ChessMatch | undefined, you: ChessColor | null) {
  const over = !!match && (match.state === "settled" || match.state === "cancelled");
  const opponentWallet =
    !match || you === null
      ? null
      : ((you === "w" ? match.black : match.white)?.walletAddress ?? null);

  const query = useQuery({
    queryKey: ["casino", "chess", "rematch-offer", match?.id ?? "none"],
    queryFn: async () => {
      const waiting = await fetchWaitingMatches();
      const theirs = (opponentWallet as string).toLowerCase();
      // Only a game opened after this one started can be its rematch.
      const found = waiting.find(
        (m) =>
          (m.white?.toLowerCase() === theirs || m.black?.toLowerCase() === theirs) &&
          m.createdAt > (match as ChessMatch).createdAt
      );
      return found?.id ?? null;
    },
    enabled: over && !!opponentWallet,
    refetchInterval: (q) => (q.state.data ? false : REMATCH_POLL_MS),
  });

  return query.data ?? null;
}

// Follows a game the player opened until somebody joins it.
export function useMatchmakingTicket(ticketId: string | null) {
  const wallet = useCasinoWallet();

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
    cancel: () =>
      ticketId && wallet.address ? cancelMatchmaking(ticketId, wallet.address) : Promise.resolve(),
  };
}

// Finished and ongoing games for one player, newest first. A settled game
// never changes, so the list refetches on focus rather than on a clock.
export function useChessHistory() {
  const wallet = useCasinoWallet();
  const query = useQuery({
    queryKey: CHESS_KEYS.history(wallet.address ?? "none"),
    queryFn: () => fetchPlayerMatches(wallet.address as string),
    enabled: !!wallet.address,
    staleTime: 30_000,
    select: (matches) =>
      [...matches].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
  });
  return {
    matches: query.data ?? [],
    isLoading: query.isPending && !!wallet.address,
    error: query.error,
    refetch: query.refetch,
    connected: wallet.connected,
  };
}
