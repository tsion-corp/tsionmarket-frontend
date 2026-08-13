"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMatchComment,
  abortMatch,
  acceptChallenge,
  cancelMatchmaking,
  claimTimeout,
  continueComputerCoachReview,
  createComputerMatch,
  createChallenge,
  fetchMatchChat,
  fetchMatchComments,
  fetchMatchNote,
  declineRematch as declineRematchAction,
  declineTakeback as declineTakebackAction,
  fetchJoinableMatches,
  fetchLobbyChallenges,
  fetchLiveMatches,
  fetchPlayerMatches,
  fetchMatch,
  fetchMatchmakingTicket,
  fetchComputerCoachState,
  extendMatchTime,
  claimDraw,
  offerDraw,
  postMatchChatMessage,
  requestRematch,
  requestComputerHint,
  requestComputerCoachHint,
  requestComputerCoachMove,
  requestTakeback,
  resignMatch,
  respondToDraw,
  saveMatchNote,
  submitMove,
  undoComputerCoachReview,
  upsertMatchComment,
} from "@/features/casino/lib/api/chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { track } from "@/lib/analytics/mixpanel";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import { CHESS_PRODUCT_KEYS } from "@/features/casino/hooks/use-chess-products";
import { CASHIER_KEYS } from "@/features/casino/hooks/use-chess-cashier";
import {
  applyChatLineFrame,
  applyCommentDeletedFrame,
  applyCommentUpsertedFrame,
  applyPositionFrame,
  applyRematchOfferFrame,
  applyRematchTakenFrame,
  applyStateFrame,
  applyTakebackOffersFrame,
  mergeChessMatchSnapshot,
  type ChessChatMessageWire,
  type ChessCommentDeletedFrame,
  parseTimeControl,
  toChessMatch,
  type ChessMatchWire,
  type ChessMatchCommentWire,
  type ChessPositionFrame,
  type ChessRematchOfferFrame,
  type ChessRematchTakenFrame,
  type ChessTakebackOffersFrame,
} from "@/features/casino/lib/api/chess-wire";
import { subscribeChessTopic } from "@/features/casino/lib/chess/live-socket";
import { applyUciToFen } from "@/features/casino/lib/chess/engine";
import { resolveViewerColor } from "@/features/casino/lib/chess/viewer";
import type {
  ChessChatMessage,
  ChessChatRoom,
  ChessColor,
  ChessMatch,
  ChessMatchComment,
  ChessMatchState,
  CreateComputerMatchInput,
  CreateChessChallengeInput,
} from "@/features/casino/lib/api/types";

// The socket is the live path; the poll is only a safety net. Before the first
// live frame (or if the socket falls silent) the match polls fast, because a
// board two seconds behind is visibly wrong. Once frames are flowing it backs
// off to a slow reconcile that merely repairs a missed frame — this keeps a
// spectator from hammering the gateway, which rate-limits per IP.
const MATCH_POLL_MS = 1_000;
const MATCH_POLL_LIVE_MS = 5_000;
const MATCH_WAITING_POLL_MS = 1_000;
const LOBBY_POLL_MS = 10_000;
// Chat lines and move comments arrive instantly over the live socket, but the
// relay is best-effort — a dropped or unfanned frame would otherwise leave the
// opponent's message invisible until a tab switch. A slow background poll is the
// safety net that keeps both surfaces fresh without the socket, mirroring the
// board's own reconcile poll but gentler, since neither is as time-critical as a
// move.
const SOCIAL_POLL_MS = 4_000;
const TICKET_POLL_MS = 1_000;
const OPTIMISTIC_RECONCILE_MS = 1_500;

// How often the displayed clock is recomputed. Four times a second keeps the
// seconds digit honest without re-rendering the board on every frame.
const CLOCK_TICK_MS = 250;

export const CHESS_KEYS = {
  challenges: ["casino", "chess", "challenges"] as const,
  liveMatches: ["casino", "chess", "live"] as const,
  match: (id: string) => ["casino", "chess", "match", id] as const,
  chat: (id: string, room: ChessChatRoom) =>
    ["casino", "chess", "match", id, "chat", room] as const,
  note: (id: string, viewer: string) => ["casino", "chess", "match", id, "note", viewer] as const,
  comments: (id: string, ply: number) => ["casino", "chess", "match", id, "comments", ply] as const,
  history: (wallet: string) => ["casino", "chess", "history", wallet] as const,
  ticket: (id: string) => ["casino", "chess", "ticket", id] as const,
  analysis: (id: string) => ["casino", "chess", "analysis", id] as const,
  insights: (player: string) => ["casino", "chess", "insights", player] as const,
  coachProgress: (player: string) => ["casino", "chess", "coach-progress", player] as const,
  coachState: (id: string, player: string) =>
    ["casino", "chess", "match", id, "coach", player] as const,
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
  const timed = (base.clockMode ?? "real_time") === "real_time";
  const elapsed = timed && Number.isFinite(since) ? Math.max(0, (now - since) / 1000) : 0;
  const bonus = timed ? incrementSeconds(base.timeControl) : 0;
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
// the UI has to tick locally between frames from the server's own clock anchor:
// the game start when no move was played yet, or the last move when one has.
// A tab switch simply pauses the repaint and catches up to that same anchor on
// return.
function useTickingClocks(match: ChessMatch | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible"
  );
  const running =
    match?.state === "in_progress" && (match.clockMode ?? "real_time") === "real_time" && visible;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible) setNow(Date.now());
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  return useMemo(() => {
    if (!match) return null;
    if (match.state !== "in_progress" || match.clockMode === "unlimited") return match.clocks;
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
export function useChessMatch(matchId: string | null, seatName: string | null = null) {
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
    queryFn: async () => {
      const id = matchId as string;
      const key = CHESS_KEYS.match(id);
      const previous = queryClient.getQueryData<ChessMatch>(key);
      const incoming = await fetchMatch(id, previous ?? null);
      // A join frame may arrive while this request is in flight. Compare with
      // the cache again after the request so a late waiting response cannot
      // overwrite the active board the socket already delivered.
      return mergeChessMatchSnapshot(queryClient.getQueryData<ChessMatch>(key), incoming);
    },
    enabled: !!matchId,
    // The create mutation seeds the waiting snapshot before routing here. Read
    // once immediately anyway, then keep the interval as the socket safety net.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
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
  const coachPlayer = seatName ?? wallet.address ?? null;
  const coachEnabled = baseMatch?.computer?.coachEnabled === true && !baseMatch.stakeUsdc;
  const coachStateQuery = useQuery({
    queryKey: CHESS_KEYS.coachState(matchId ?? "none", coachPlayer ?? "none"),
    queryFn: () => fetchComputerCoachState(matchId as string, coachPlayer as string),
    enabled: !!matchId && !!coachPlayer && coachEnabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });

  // Live path: the service publishes state/position/gameOver plus rematch and
  // takeback frames to the ws-gateway on the match's liveTopic. Finished boards
  // still stay subscribed because rematch never polls: the post-game actions
  // advance only over this socket.
  const liveTopic = match?.liveTopic ?? (matchId ? `chess:match:${matchId}` : null);
  useEffect(() => {
    if (!liveTopic || !matchId) return;
    return subscribeChessTopic(liveTopic, (frame) => {
      const { type, data } = frame;
      if (type === "__open") {
        // The gateway does not replay state on subscribe, so every open or
        // reconnect forces one fresh snapshot from REST. Do not mark the relay
        // live yet: if this topic never starts flowing, the fast poll is the
        // only thing keeping the opponent's move from appearing five seconds
        // late.
        void queryClient.refetchQueries({
          queryKey: CHESS_KEYS.match(matchId),
          type: "active",
        });
        return;
      }
      // The socket dropped: speed the poll back up until it reconnects.
      if (type === "__closed") {
        setLiveMatchId((current) => (current === matchId ? null : current));
        return;
      }
      if (
        type !== "state" &&
        type !== "position" &&
        type !== "gameOver" &&
        type !== "chatLine" &&
        type !== "commentUpserted" &&
        type !== "commentDeleted" &&
        type !== "rematchOffer" &&
        type !== "rematchTaken" &&
        type !== "takebackOffers" &&
        type !== "coachReview" &&
        type !== "coachContinued" &&
        type !== "coachUndone" &&
        type !== "coachHint" &&
        type !== "coachSummary"
      ) {
        return;
      }
      // The shared socket already routed this frame here by its topic, so it is
      // this match's. A frame proves the relay is live: let the match poll drop
      // to its slow safety-net interval.
      setLiveMatchId(matchId);

      // Apply the pushed payload straight to the cache so the move renders the
      // instant the gateway relays it — no refetch round-trip. gameOver (and any
      // frame missing its payload) still reconciles from the source, because the
      // final result reason and clocks are worth one authoritative read. The poll
      // remains as a safety net that repairs any missed frame.
      if (
        type === "coachReview" ||
        type === "coachContinued" ||
        type === "coachUndone" ||
        type === "coachHint" ||
        type === "coachSummary"
      ) {
        if (coachPlayer) {
          void queryClient.invalidateQueries({
            queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
          });
        }
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
      } else if (type === "position" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev ? applyPositionFrame(prev, data as ChessPositionFrame) : prev
        );
      } else if (type === "state" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev
            ? applyStateFrame(prev, data as ChessMatchWire)
            : toChessMatch(data as ChessMatchWire)
        );
        // Challenge acceptance is a lifecycle boundary. Like Lichess's
        // challenge `reload` event, reconcile once from the authoritative
        // endpoint after applying the pushed state immediately.
        void queryClient.refetchQueries({
          queryKey: CHESS_KEYS.match(matchId),
          type: "active",
        });
      } else if (type === "takebackOffers" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev ? applyTakebackOffersFrame(prev, data as ChessTakebackOffersFrame) : prev
        );
      } else if (type === "rematchOffer" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev ? applyRematchOfferFrame(prev, data as ChessRematchOfferFrame) : prev
        );
      } else if (type === "rematchTaken" && data) {
        queryClient.setQueryData<ChessMatch>(CHESS_KEYS.match(matchId), (prev) =>
          prev ? applyRematchTakenFrame(prev, data as ChessRematchTakenFrame) : prev
        );
      } else if (type === "chatLine" && data) {
        const frame = data as ChessChatMessageWire;
        queryClient.setQueryData<ChessChatMessage[]>(CHESS_KEYS.chat(matchId, frame.room), (prev) =>
          applyChatLineFrame(prev ?? [], frame)
        );
      } else if (type === "commentUpserted" && data) {
        const frame = data as ChessMatchCommentWire;
        queryClient.setQueryData<ChessMatchComment[]>(
          CHESS_KEYS.comments(matchId, frame.ply),
          (prev) => applyCommentUpsertedFrame(prev ?? [], frame)
        );
      } else if (type === "commentDeleted" && data) {
        const frame = data as ChessCommentDeletedFrame;
        queryClient.setQueryData<ChessMatchComment[]>(
          CHESS_KEYS.comments(matchId, frame.ply),
          (prev) => (prev ? applyCommentDeletedFrame(prev, frame) : prev)
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
        if (type === "gameOver" && coachPlayer) {
          void queryClient.invalidateQueries({
            queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
          });
        }
      }
    });
  }, [coachPlayer, liveTopic, matchId, queryClient]);

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

  const you = resolveViewerColor(match, wallet.address ?? null, seatName);

  // Who the write names as the acting player. A managed Swiss-tournament board
  // seats a player by the short display name they registered under — carried on
  // the play URL as `?player=` and surfaced here as seatName — not by their
  // wallet, so a tournament move has to name that seat or the service reads it
  // as coming from a non-player and refuses it (which then flags the mover on
  // time). Ordinary games have no seatName and fall back to the wallet, which
  // the proxy re-stamps from the proven session anyway. The proxy leaves a
  // non-wallet seat name intact while still forwarding the proven wallet as
  // `x-wallet-address`, so the service can bind the named seat to the caller.
  const actingPlayer = () => seatName ?? requireWallet(wallet.address);

  const move = useMutation({
    mutationFn: (uci: string) =>
      submitMove(matchId as string, uci, actingPlayer(), baseMatch?.moves ?? []),
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

  const coachedMove = useMutation({
    mutationFn: (uci: string) =>
      requestComputerCoachMove(
        matchId as string,
        actingPlayer(),
        uci,
        baseMatch?.moves.length ?? 0,
        newChessIdempotencyKey()
      ),
    onSuccess: (review) => {
      if (review.matchState) applyMatch(review.matchState);
      if (matchId && coachPlayer) {
        const awaitingResponse = review.status === "review";
        queryClient.setQueryData(CHESS_KEYS.coachState(matchId, coachPlayer), {
          matchId,
          enabled: true,
          player: coachPlayer,
          ply: review.matchState?.moves.length ?? review.ply + 1,
          canMove: false,
          awaitingResponse,
          hintLevel: 0,
          pendingWarning: null,
          pendingReview: awaitingResponse ? review : null,
          summary: null,
          actions: awaitingResponse ? review.actions : [],
        });
        if (!awaitingResponse) {
          void queryClient.invalidateQueries({
            queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
          });
        }
      }
    },
  });

  const continueCoachReview = useMutation({
    mutationFn: (attemptId: string) =>
      continueComputerCoachReview(
        matchId as string,
        actingPlayer(),
        attemptId,
        baseMatch?.moves.length ?? 0
      ),
    onSuccess: (review) => {
      if (review.matchState) applyMatch(review.matchState);
      if (matchId && coachPlayer) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
        });
      }
      if (matchId) {
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
      }
    },
  });

  const undoCoachReview = useMutation({
    mutationFn: (attemptId: string) =>
      undoComputerCoachReview(
        matchId as string,
        actingPlayer(),
        attemptId,
        baseMatch?.moves.length ?? 0
      ),
    onSuccess: (review) => {
      if (review.matchState) applyMatch(review.matchState);
      if (matchId && coachPlayer) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
        });
      }
    },
  });

  const coachedHint = useMutation({
    mutationFn: () =>
      requestComputerCoachHint(
        matchId as string,
        actingPlayer(),
        baseMatch?.moves.length ?? 0,
        newChessIdempotencyKey()
      ),
    onSuccess: () => {
      if (matchId && coachPlayer) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_KEYS.coachState(matchId, coachPlayer),
        });
      }
    },
  });

  const resign = useMutation({
    mutationFn: () => resignMatch(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const proposeDraw = useMutation({
    mutationFn: () => offerDraw(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const answerDraw = useMutation({
    mutationFn: (accept: boolean) => respondToDraw(matchId as string, actingPlayer(), accept),
    onSuccess: applyMatch,
  });

  const abort = useMutation({
    mutationFn: () => abortMatch(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  // Threefold repetition and the fifty-move rule are claimed, never automatic;
  // the service arbitrates the claim and rejects it when neither holds.
  const drawClaim = useMutation({
    mutationFn: () => claimDraw(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const rematch = useMutation({
    mutationFn: () => requestRematch(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const declineRematch = useMutation({
    mutationFn: () => declineRematchAction(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const takeback = useMutation({
    mutationFn: () => requestTakeback(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const declineTakeback = useMutation({
    mutationFn: () => declineTakebackAction(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const flag = useMutation({
    mutationFn: () => claimTimeout(matchId as string, actingPlayer()),
    onSuccess: applyMatch,
  });

  const hint = useMutation({
    mutationFn: () =>
      requestComputerHint(matchId as string, actingPlayer(), newChessIdempotencyKey()),
    onSuccess: (result) => {
      if (matchId) {
        void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.match(matchId) });
      }
      if (wallet.address) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_PRODUCT_KEYS.access(wallet.address),
        });
      }
      return result;
    },
  });

  const timeExtension = useMutation({
    mutationFn: (seconds: 60 | 300 | 600) =>
      extendMatchTime(matchId as string, actingPlayer(), seconds, newChessIdempotencyKey()),
    onSuccess: (next) => {
      applyMatch(next);
      if (wallet.address) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_PRODUCT_KEYS.access(wallet.address),
        });
        void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet.address) });
      }
    },
  });

  // The service does not end a game when a clock runs out, so the player who is
  // still on the move has to claim it. Only the opponent of the flagged side
  // claims, and only once per match: a repeated claim would be rejected, and
  // the poll would keep re-triggering it.
  const claimedRef = useRef<string | null>(null);
  const opponentFlagged =
    !!match &&
    match.state === "in_progress" &&
    (match.clockMode ?? "real_time") === "real_time" &&
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
    coachState: coachStateQuery.data ?? null,
    coachStateLoading: coachStateQuery.isLoading,
    submitCoachedMove: coachedMove.mutateAsync,
    coachingMove: coachedMove.isPending,
    continueCoachReview: continueCoachReview.mutateAsync,
    continuingCoachReview: continueCoachReview.isPending,
    undoCoachReview: undoCoachReview.mutateAsync,
    undoingCoachReview: undoCoachReview.isPending,
    requestCoachHint: coachedHint.mutateAsync,
    requestingCoachHint: coachedHint.isPending,
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
    declineRematch: declineRematch.mutateAsync,
    decliningRematch: declineRematch.isPending,
    takeback: takeback.mutateAsync,
    requestingTakeback: takeback.isPending,
    declineTakeback: declineTakeback.mutateAsync,
    decliningTakeback: declineTakeback.isPending,
    requestHint: hint.mutateAsync,
    requestingHint: hint.isPending,
    extendTime: timeExtension.mutateAsync,
    extendingTime: timeExtension.isPending,
    claimingTimeout: flag.isPending,
  };
}

export function useChessMatchSocial(
  matchId: string | null,
  room: ChessChatRoom,
  canUsePlayerRoom: boolean,
  currentPly: number | null,
  // The tournament seat name for a managed-tournament board (null on ordinary
  // wallet-seated games). The chat/note/comment writes are seat-gated exactly
  // like moves, so the caller must name the seat here or the service rejects a
  // real tournament player as a non-player. See the note in chess.ts.
  seatName: string | null = null,
  chatEnabled = true
) {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  const { ready, authenticated } = usePrivy();
  // On a tournament board the caller is their seat name; otherwise the wallet.
  // The note is per-caller, so it is cached under whichever identity acts.
  const viewer = seatName ?? wallet.address?.toLowerCase() ?? "anon";
  const privateReadsReady = ready && authenticated && !!wallet.address;
  const activeRoom: ChessChatRoom =
    room === "player" && canUsePlayerRoom && privateReadsReady ? "player" : "spectator";

  const chat = useQuery({
    queryKey: CHESS_KEYS.chat(matchId ?? "none", activeRoom),
    queryFn: () => fetchMatchChat(matchId as string, { room: activeRoom, limit: 100 }, seatName),
    enabled: chatEnabled && !!matchId && (activeRoom === "spectator" || privateReadsReady),
    retry: false,
    refetchInterval: (query) => {
      const gateway = query.state.error as { status?: unknown; code?: unknown } | null;
      const status = typeof gateway?.status === "number" ? gateway.status : null;
      const code = typeof gateway?.code === "string" ? gateway.code : null;
      return status === 404 ||
        status === 409 ||
        code === "NOT_FOUND" ||
        code === "CONFLICT" ||
        code === "BAD_RESPONSE"
        ? false
        : SOCIAL_POLL_MS;
    },
    refetchIntervalInBackground: true,
  });

  const note = useQuery({
    queryKey: CHESS_KEYS.note(matchId ?? "none", viewer),
    queryFn: () => fetchMatchNote(matchId as string, seatName),
    enabled: !!matchId && privateReadsReady,
  });

  const comments = useQuery({
    queryKey: CHESS_KEYS.comments(matchId ?? "none", currentPly ?? -1),
    queryFn: () => fetchMatchComments(matchId as string, currentPly ?? undefined),
    enabled: !!matchId && currentPly !== null,
    refetchInterval: SOCIAL_POLL_MS,
    refetchIntervalInBackground: true,
  });

  const postChat = useMutation({
    mutationFn: (input: { room: ChessChatRoom; text: string }) =>
      postMatchChatMessage(matchId as string, input.room, input.text, seatName),
    onSuccess: (line) => {
      queryClient.setQueryData<ChessChatMessage[]>(
        CHESS_KEYS.chat(matchId as string, line.room),
        (prev) =>
          prev && prev.some((item) => item.id === line.id) ? prev : [...(prev ?? []), line]
      );
    },
  });

  const saveNote = useMutation({
    mutationFn: (text: string) => saveMatchNote(matchId as string, text, seatName),
    onSuccess: (saved) => {
      queryClient.setQueryData(CHESS_KEYS.note(matchId as string, viewer), saved);
    },
  });

  const upsertComment = useMutation({
    mutationFn: (input: { ply: number; text: string }) =>
      upsertMatchComment(matchId as string, input, seatName),
    onSuccess: (saved) => {
      queryClient.setQueryData<ChessMatchComment[]>(
        CHESS_KEYS.comments(matchId as string, saved.ply),
        (prev) => {
          const withoutCurrent = (prev ?? []).filter((comment) => comment.id !== saved.id);
          return [...withoutCurrent, saved].sort((left, right) => {
            const byCreated = Date.parse(left.createdAt) - Date.parse(right.createdAt);
            return Number.isFinite(byCreated) ? byCreated : 0;
          });
        }
      );
    },
  });

  const removeComment = useMutation({
    mutationFn: (input: { commentId: string; ply: number }) =>
      deleteMatchComment(matchId as string, input.commentId, seatName).then((deleted) => ({
        deleted,
        ply: input.ply,
      })),
    onSuccess: ({ deleted, ply }) => {
      queryClient.setQueryData<ChessMatchComment[]>(
        CHESS_KEYS.comments(matchId as string, ply),
        (prev) => (prev ?? []).filter((comment) => comment.id !== deleted.id)
      );
    },
  });

  return {
    chatMessages: chat.data ?? [],
    chatLoading: chat.isLoading,
    chatError: chat.error,
    activeChatRoom: activeRoom,
    postChat: postChat.mutateAsync,
    postingChat: postChat.isPending,
    note: note.data ?? null,
    noteLoading: note.isLoading,
    noteError: note.error,
    saveNote: saveNote.mutateAsync,
    savingNote: saveNote.isPending,
    comments: comments.data ?? [],
    commentsLoading: comments.isLoading,
    commentsError: comments.error,
    upsertComment: upsertComment.mutateAsync,
    savingComment: upsertComment.isPending,
    deleteComment: removeComment.mutateAsync,
    deletingComment: removeComment.isPending,
  };
}

// A time control reads as "30s", "2m" or a legacy "5+3". The catalog wants it
// in minutes, so a per-move budget in seconds becomes a fraction of one.
//
// Returns 0 for anything it cannot read. Analytics must never be the reason a
// join fails, and this runs inside the mutation's onSuccess, where a throw
// would take the navigation with it.
function clockMinutes(label: string | undefined): number {
  const main = label?.split("+")[0]?.trim();
  if (!main) return 0;
  if (main.endsWith("m")) return Number(main.slice(0, -1)) || 0;
  if (main.endsWith("s")) return Number(main.slice(0, -1)) / 60 || 0;
  return Number(main) || 0;
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  return useMutation({
    mutationFn: (input: CreateChessChallengeInput) =>
      createChallenge({ ...input, creator: requireWallet(wallet.address) }),
    onSuccess: ({ match }, input) => {
      const stake = Number(match.stakeUsdc ?? 0);
      track("chess_game_created", {
        clock_min: clockMinutes(input.timeControl),
        stake_usd: stake,
        // The catalog's "quick" is this app's auto-pairing mode.
        mode: input.mode === "auto" ? "quick" : "invite",
      });
      if (stake > 0) track("game_staked", { game: "chess", amount_usd: stake });
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.challenges });
    },
  });
}

export function useCreateComputerMatch() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  return useMutation({
    mutationFn: (input: CreateComputerMatchInput) =>
      createComputerMatch({
        ...input,
        player: requireWallet(wallet.address),
        ...(input.stakeUsdc ? { idempotencyKey: newChessIdempotencyKey() } : {}),
      }),
    onSuccess: (match) => {
      queryClient.setQueryData(CHESS_KEYS.match(match.id), match);
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.liveMatches });
      if (wallet.address) {
        void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet.address) });
      }
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
      const stake = Number(match.stakeUsdc ?? 0);
      track("chess_challenge_accepted", {
        stake_usd: stake,
        clock_min: clockMinutes(match.timeControl),
      });
      // Both seats are filled, so the game is under way.
      track("chess_game_started", { stake_usd: stake });
      if (stake > 0) track("game_staked", { game: "chess", amount_usd: stake });
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
