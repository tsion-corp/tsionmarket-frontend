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
  fetchLobbyChallenges,
  fetchLiveMatches,
  fetchMatch,
  fetchMatchmakingTicket,
  fetchPlayerMatches,
  fetchWaitingMatches,
  claimDraw,
  offerDraw,
  requestRematch,
  resignMatch,
  respondToDraw,
  submitMove,
} from "@/lib/casino/api/chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  applyPositionFrame,
  applyStateFrame,
  parseTimeControl,
  toChessMatch,
  type ChessMatchWire,
  type ChessPositionFrame,
} from "@/lib/casino/api/chess-wire";
import { subscribeChessTopic } from "@/lib/casino/chess/live-socket";
import { applyUciToFen } from "@/lib/casino/chess/engine";
import type {
  ChessColor,
  ChessMatch,
  ChessMatchState,
  CreateChessChallengeInput,
} from "@/lib/casino/api/types";

// The socket is the live path; the poll is only a safety net. Before the first
// live frame (or if the socket falls silent) the match polls fast, because a
// board two seconds behind is visibly wrong. Once frames are flowing it backs
// off to a slow reconcile that merely repairs a missed frame — this keeps a
// spectator from hammering the gateway, which rate-limits per IP.
const MATCH_POLL_MS = 1_000;
const MATCH_POLL_LIVE_MS = 5_000;
const MATCH_WAITING_POLL_MS = 1_000;
const LOBBY_POLL_MS = 10_000;
const TICKET_POLL_MS = 1_000;
const OPTIMISTIC_RECONCILE_MS = 1_500;

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

interface OptimisticMatchState {
  baseFen: string;
  baseMoveCount: number;
  match: ChessMatch;
}

function incrementSeconds(timeControl: string): number {
  try {
    return parseTimeControl(timeControl).incrementSeconds;
  } catch {
    return 0;
  }
}

function optimisticMove(base: ChessMatch, uci: string): OptimisticMatchState | null {
  if (base.state !== "in_progress") return null;
  const nextPosition = applyUciToFen(base.fen, uci);
  if (!nextPosition) {
    return null;
  }
  const now = Date.now();
  const since = Date.parse(base.clockUpdatedAt);
  const elapsed = Number.isFinite(since) ? Math.max(0, (now - since) / 1000) : 0;
  const bonus = incrementSeconds(base.timeControl);
  const nextClocks = {
    ...base.clocks,
    [base.turn]: Math.max(0, base.clocks[base.turn] - elapsed) + bonus,
  };

  return {
    baseFen: base.fen,
    baseMoveCount: base.moves.length,
    match: {
      ...base,
      fen: nextPosition.fen,
      turn: nextPosition.turn,
      clocks: nextClocks,
      clockUpdatedAt: new Date(now).toISOString(),
      drawOffered: null,
    },
  };
}

// Every write names the player acting, so an action taken before the wallet is
// known would be rejected with a confusing message from the service.
function requireWallet(address: string | null): string {
  if (!address) throw new Error("Connect your wallet to play.");
  return address;
}

export function chessMatchRefetchMs(
  state: ChessMatchState | undefined,
  socketLive: boolean
): number | false {
  if (state === "settled" || state === "cancelled") return false;
  if (state === "awaiting_opponent") return MATCH_WAITING_POLL_MS;
  return socketLive ? MATCH_POLL_LIVE_MS : MATCH_POLL_MS;
}

export function useChessLobby(wallet: string | null) {
  const challenges = useQuery({
    queryKey: [...CHESS_KEYS.challenges, wallet ?? "anon"],
    queryFn: () => fetchLobbyChallenges(wallet),
    refetchInterval: LOBBY_POLL_MS,
  });
  const live = useQuery({
    queryKey: CHESS_KEYS.liveMatches,
    queryFn: fetchLiveMatches,
    refetchInterval: LOBBY_POLL_MS,
  });
  const mine = wallet?.toLowerCase() ?? null;
  const allLive =
    live.data
      ?.filter((match) => match.state === "in_progress")
      .sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }) ?? [];
  const isMine = (match: ChessMatch) =>
    !!mine &&
    (match.white?.walletAddress?.toLowerCase() === mine ||
      match.black?.walletAddress?.toLowerCase() === mine);
  const myActiveGames = mine ? allLive.filter(isMine) : [];
  return {
    challenges: challenges.data?.challenges ?? [],
    myActiveGames,
    myOpenGames: challenges.data?.myOpenGames ?? [],
    liveMatches: allLive.filter((match) => !isMine(match)),
    isLoading: challenges.isLoading || live.isLoading,
    error: challenges.error ?? live.error,
    refetch: () => {
      void challenges.refetch();
      void live.refetch();
    },
  };
}

// The clock of whoever is to move, counted down only while this client is
// actively watching the current server snapshot.
//
// The service reports the banked time snapshot, not a per-frame countdown. So
// the UI has to tick locally between frames, but it must not back-charge time
// the player did not actually watch: leaving the page, backgrounding the tab,
// then coming back to an old snapshot must not instantly flag the mover.
function useTickingClocks(match: ChessMatch | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible"
  );
  const [observed, setObserved] = useState<{ key: string | null; at: number }>({
    key: null,
    at: 0,
  });
  const wasVisibleRef = useRef(visible);
  const running = match?.state === "in_progress" && visible;

  const snapshotKey = useMemo(() => {
    if (!match) return null;
    return [
      match.id,
      match.state,
      match.turn,
      match.clockUpdatedAt,
      match.clocks.w,
      match.clocks.b,
    ].join("|");
  }, [match]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (snapshotKey && (becameVisible || observed.key !== snapshotKey)) {
      setObserved({ key: snapshotKey, at: Date.now() });
    }
  }, [observed, snapshotKey, visible]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  return useMemo(() => {
    if (!match) return null;
    if (match.state !== "in_progress") return match.clocks;
    const elapsed =
      visible && observed.key === snapshotKey ? Math.max(0, (now - observed.at) / 1000) : 0;
    return {
      ...match.clocks,
      [match.turn]: Math.max(0, match.clocks[match.turn] - elapsed),
    } as Record<ChessColor, number>;
  }, [match, now, observed, snapshotKey, visible]);
}

// One live match. The board, clocks and result all come from the server; the
// client submits intended moves and renders whatever comes back.
export function useChessMatch(matchId: string | null) {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  const [optimistic, setOptimistic] = useState<OptimisticMatchState | null>(null);

  // The match id whose live socket has delivered a frame. Deriving "is the
  // socket live?" from it (rather than a bare boolean) means a change of match
  // resets it for free — no setState in the socket effect. While live the poll
  // backs off; it speeds back up if the socket drops or the match changes.
  const [liveMatchId, setLiveMatchId] = useState<string | null>(null);
  const socketLive = matchId != null && liveMatchId === matchId;

  const query = useQuery({
    queryKey: CHESS_KEYS.match(matchId ?? "none"),
    queryFn: () =>
      fetchMatch(
        matchId as string,
        matchId ? (queryClient.getQueryData<ChessMatch>(CHESS_KEYS.match(matchId)) ?? null) : null
      ),
    enabled: !!matchId,
    refetchInterval: (q) => chessMatchRefetchMs(q.state.data?.state, socketLive),
    // A second browser/tab on the same game must keep moving even when it is
    // backgrounded. If the live socket is absent or silent (local backend with
    // no broker fanout, dropped relay, etc.), window-focus refetch is too late:
    // the hidden board would only catch up when you click back into it.
    refetchIntervalInBackground: true,
  });

  const baseMatch = query.data;
  const match =
    optimistic &&
    baseMatch &&
    optimistic.match.id === baseMatch.id &&
    optimistic.baseFen === baseMatch.fen &&
    optimistic.baseMoveCount === baseMatch.moves.length
      ? optimistic.match
      : baseMatch;
  const clocks = useTickingClocks(match);

  // Live path: the service publishes state/position/gameOver frames to the
  // ws-gateway on the match's liveTopic. We subscribe through the shared client
  // socket (one per browser, never one per match) and apply each frame straight
  // to the cache so moves render the instant they arrive; only a real chess
  // frame marks the relay live, because a bare socket open does not prove this
  // topic is flowing and a false "live" state would stretch a broken relay into
  // a five-second poll delay for the opponent's move.
  const liveTopic = match?.liveTopic ?? (matchId ? `chess:match:${matchId}` : null);
  const liveTrackable =
    match?.state === undefined || (match.state !== "settled" && match.state !== "cancelled");
  useEffect(() => {
    if (!liveTopic || !matchId || !liveTrackable) return;
    return subscribeChessTopic(liveTopic, (frame) => {
      const { type, data } = frame;
      if (type === "__open") {
        // The gateway does not replay state on subscribe, so every open or
        // reconnect forces one fresh snapshot from REST. Do not mark the relay
        // live yet: if this topic never starts flowing, the fast poll is the
        // only thing keeping the opponent's move from appearing five seconds
        // late.
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
        return;
      }
      // The socket dropped: speed the poll back up until it reconnects.
      if (type === "__closed") {
        setLiveMatchId((current) => (current === matchId ? null : current));
        return;
      }
      if (type !== "state" && type !== "position" && type !== "gameOver") return;
      // The shared socket already routed this frame here by its topic, so it is
      // this match's. A frame proves the relay is live: let the match poll drop
      // to its slow safety-net interval.
      setLiveMatchId(matchId);

      // Apply the pushed payload straight to the cache so the move renders the
      // instant the gateway relays it — no refetch round-trip. gameOver (and any
      // frame missing its payload) still reconciles from the source, because the
      // final result reason and clocks are worth one authoritative read. The poll
      // remains as a safety net that repairs any missed frame.
      if (type === "position" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev ? applyPositionFrame(prev, data as ChessPositionFrame) : prev
        );
      } else if (type === "state" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev
            ? applyStateFrame(prev, data as ChessMatchWire)
            : toChessMatch(data as ChessMatchWire)
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
      }
    });
  }, [liveTopic, liveTrackable, matchId, queryClient]);

  useEffect(() => {
    if (!optimistic || !matchId) return;
    const id = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
    }, OPTIMISTIC_RECONCILE_MS);
    return () => clearTimeout(id);
  }, [matchId, optimistic, queryClient]);

  const applyMatch = useCallback(
    (next: ChessMatch) => {
      setOptimistic(null);
      queryClient.setQueryData(CHESS_KEYS.match(next.id), next);
    },
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
      submitMove(matchId as string, uci, requireWallet(wallet.address), baseMatch?.moves ?? []),
    onMutate: (uci) => {
      if (!matchId) return;
      const current = queryClient.getQueryData<ChessMatch>(CHESS_KEYS.match(matchId));
      if (!current) return;
      const next = optimisticMove(current, uci);
      if (next) {
        setOptimistic(next);
      }
    },
    onError: () => setOptimistic(null),
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
    onSuccess: ({ match }) => {
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
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
          queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
          return { matchId: match.id, waitingOn: null };
        } catch {
          // Somebody else took the seat between the list and the join. Try the
          // next one; if they all go, we open our own game below.
          continue;
        }
      }

      const { challenge, match, ticket } = await createChallenge({ ...input, creator: address });
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
      if (ticket) queryClient.setQueryData(CHESS_KEYS.ticket(ticket.id), ticket);
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
