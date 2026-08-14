"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subscribeChessTopic } from "@/features/casino/lib/chess/live-socket";
import {
  applyChatLineFrame,
  applyCommentDeletedFrame,
  applyCommentUpsertedFrame,
  applyPositionFrame,
  applyRematchOfferFrame,
  applyRematchTakenFrame,
  applyTakebackOffersFrame,
  toDraughtsMatch,
  type DraughtsChatMessageWire,
  type DraughtsCommentDeletedFrame,
  type DraughtsMatchCommentWire,
  type DraughtsMatchWire,
  type DraughtsPositionFrame,
  type DraughtsRematchOfferFrame,
  type DraughtsRematchTakenFrame,
  type DraughtsTakebackOffersFrame,
} from "@/features/casino/lib/api/draughts-wire";
import {
  deleteMatchComment,
  fetchMatch,
  fetchMatchChat,
  fetchMatchComments,
  fetchMatchNote,
  fetchLiveMatches,
  fetchOpenChallenges,
  fetchPlayerMatches,
  postMatchChatMessage,
  saveMatchNote,
  upsertMatchComment,
} from "@/features/casino/lib/api/draughts";
import type {
  DraughtsChatMessage,
  DraughtsChatRoom,
  DraughtsMatch,
  DraughtsMatchComment,
  DraughtsMatchState,
} from "@/features/casino/lib/draughts/types";
import type { DraughtsSide } from "@/features/casino/lib/draughts/engine";

export const DRAUGHTS_KEYS = {
  challenges: ["casino", "draughts", "challenges"] as const,
  match: (id: string) => ["casino", "draughts", "match", id] as const,
  history: (wallet: string) => ["casino", "draughts", "history", wallet] as const,
  live: ["casino", "draughts", "live"] as const,
  chat: (id: string, room: DraughtsChatRoom) =>
    ["casino", "draughts", "match", id, "chat", room] as const,
  comments: (id: string) => ["casino", "draughts", "match", id, "comments"] as const,
  note: (id: string, viewer: string) =>
    ["casino", "draughts", "match", id, "note", viewer] as const,
};

// The relay is the fast path and the poll is the repair path, so the poll backs
// off once frames are arriving. A settled game only changes through a rematch
// offer, which arrives over the socket, so it barely polls at all.
const LIVE_POLL_MS = 2_000;
const RELAYED_POLL_MS = 8_000;
const SETTLED_POLL_MS = 20_000;
const LOBBY_POLL_MS = 5_000;
const CLOCK_TICK_MS = 250;

function matchRefetchMs(state: DraughtsMatchState | undefined, socketLive: boolean): number {
  if (state === "settled" || state === "cancelled") return SETTLED_POLL_MS;
  return socketLive ? RELAYED_POLL_MS : LIVE_POLL_MS;
}

/** The clock a side has left, counted down from the last figure the server gave. */
export function remainingSeconds(match: DraughtsMatch, side: DraughtsSide, now: number): number {
  const base = match.clocks[side];
  if (match.state !== "in_progress" || match.turn !== side) return Math.max(0, base);
  const since = Date.parse(match.clockUpdatedAt);
  const elapsed = Number.isFinite(since) ? Math.max(0, (now - since) / 1000) : 0;
  return Math.max(0, base - elapsed);
}

// A clock that only ticks while a game is running, so a finished board stops
// re-rendering four times a second.
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

export interface UseDraughtsMatchResult {
  match: DraughtsMatch | null;
  loading: boolean;
  error: string | null;
  /** Ticks locally so the clocks move between server frames. */
  now: number;
  live: boolean;
  refresh: () => void;
  /** Replace the cached match after a write returns a fresh one. */
  apply: (next: DraughtsMatch) => void;
}

export function useDraughtsMatch(matchId: string | null): UseDraughtsMatchResult {
  const queryClient = useQueryClient();

  // The match whose socket has delivered a frame. Deriving "is the relay live?"
  // from the id rather than a bare boolean means changing match resets it for
  // free, with no setState in the socket effect.
  const [liveMatchId, setLiveMatchId] = useState<string | null>(null);
  const socketLive = matchId != null && liveMatchId === matchId;

  const query = useQuery({
    queryKey: DRAUGHTS_KEYS.match(matchId ?? "none"),
    queryFn: () =>
      fetchMatch(
        matchId as string,
        matchId
          ? (queryClient.getQueryData<DraughtsMatch>(DRAUGHTS_KEYS.match(matchId)) ?? null)
          : null
      ),
    enabled: !!matchId,
    refetchInterval: (q) => matchRefetchMs(q.state.data?.state, socketLive),
    // A second tab on the same game must keep moving even when backgrounded: if
    // the relay is silent, a focus-only refetch would leave that board frozen.
    refetchIntervalInBackground: true,
  });

  const match = query.data ?? null;
  const now = useNow(match?.state === "in_progress");

  const apply = useCallback(
    (next: DraughtsMatch) => {
      queryClient.setQueryData(DRAUGHTS_KEYS.match(next.id), next);
    },
    [queryClient]
  );

  const refresh = useCallback(() => {
    if (!matchId) return;
    void queryClient.invalidateQueries({ queryKey: DRAUGHTS_KEYS.match(matchId) });
  }, [queryClient, matchId]);

  // Live frames. The board takes the server's position straight off the frame,
  // so an opponent's move lands without waiting for the next poll. A finished
  // board stays subscribed because rematch never polls.
  const liveTopic = match?.liveTopic ?? (matchId ? `draughts:match:${matchId}` : null);
  useEffect(() => {
    if (!liveTopic || !matchId) return;
    const key = DRAUGHTS_KEYS.match(matchId);

    return subscribeChessTopic(liveTopic, (frame) => {
      const { type, data } = frame;
      if (type === "__open") {
        // The gateway does not replay state on subscribe, so every open or
        // reconnect takes one fresh snapshot. The relay is not marked live yet:
        // if this topic never flows, the fast poll is the only thing keeping the
        // opponent's move from appearing seconds late.
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      if (type === "__closed") {
        setLiveMatchId(null);
        return;
      }
      if (!data || typeof data !== "object") return;
      setLiveMatchId(matchId);

      queryClient.setQueryData<DraughtsMatch>(key, (prev) => {
        if (!prev) return prev;
        switch (type) {
          case "position":
            return applyPositionFrame(prev, data as DraughtsPositionFrame);
          case "state":
            // A full snapshot carries no move list, so the history we already
            // have is kept and the poll repairs any gap.
            return {
              ...toDraughtsMatch(data as DraughtsMatchWire),
              moves: prev.moves,
              clockUpdatedAt: new Date().toISOString(),
            };
          case "takebackOffers":
            return applyTakebackOffersFrame(prev, data as DraughtsTakebackOffersFrame);
          case "rematchOffer":
            return applyRematchOfferFrame(prev, data as DraughtsRematchOfferFrame);
          case "rematchTaken":
            return applyRematchTakenFrame(prev, data as DraughtsRematchTakenFrame);
          default:
            return prev;
        }
      });
    });
  }, [liveTopic, matchId, queryClient]);

  return {
    match,
    loading: query.isPending && !!matchId,
    error: query.error instanceof Error ? query.error.message : null,
    now,
    live: socketLive,
    refresh,
    apply,
  };
}

/** The open seats anyone can join, plus the caller's own unfinished games. */
export function useDraughtsLobby(wallet: string | null) {
  const challenges = useQuery({
    queryKey: DRAUGHTS_KEYS.challenges,
    queryFn: fetchOpenChallenges,
    refetchInterval: LOBBY_POLL_MS,
  });

  const history = useQuery({
    queryKey: DRAUGHTS_KEYS.history(wallet ?? "anon"),
    queryFn: () => fetchPlayerMatches(wallet as string),
    enabled: !!wallet,
    refetchInterval: LOBBY_POLL_MS,
  });

  // A finished game is history, not something to walk back into.
  const mine = useMemo(
    () =>
      (history.data ?? []).filter(
        (match) => match.state !== "settled" && match.state !== "cancelled"
      ),
    [history.data]
  );

  // Games already under way, offered to watch rather than join.
  const live = useQuery({
    queryKey: DRAUGHTS_KEYS.live,
    queryFn: fetchLiveMatches,
    refetchInterval: LOBBY_POLL_MS,
  });

  return {
    challenges: challenges.data ?? [],
    mine,
    live: live.data ?? EMPTY_MATCHES,
    loading: challenges.isPending,
    error: challenges.error instanceof Error ? challenges.error.message : null,
    refetch: () => {
      void challenges.refetch();
      void live.refetch();
    },
  };
}

/** Public games currently under way, without loading any player-private lobby data. */
export function useDraughtsLiveMatches(enabled = true) {
  const live = useQuery({
    queryKey: DRAUGHTS_KEYS.live,
    queryFn: fetchLiveMatches,
    enabled,
    refetchInterval: LOBBY_POLL_MS,
  });
  return {
    matches: live.data ?? EMPTY_MATCHES,
    loading: live.isPending,
    error: live.error instanceof Error ? live.error.message : null,
  };
}

// Stable empty default so a consumer's memo does not re-run while loading.
const EMPTY_MATCHES: DraughtsMatch[] = [];

/**
 * The social surfaces around a board: the two chat rooms, the caller's private
 * note, and the per-ply comments. Chat and comments arrive over the same socket
 * the board uses, so they update without a poll of their own.
 */
export function useDraughtsMatchSocial(
  matchId: string | null,
  wallet: string | null,
  room: DraughtsChatRoom,
  options: { comments?: boolean; note?: boolean } = {}
) {
  const queryClient = useQueryClient();
  const commentsEnabled = options.comments === true;
  const noteEnabled = options.note === true;
  // The player room is private to the two seats, so it is only fetched once a
  // wallet is known.
  const chatEnabled = !!matchId && (room === "spectator" || !!wallet);

  const chat = useQuery({
    queryKey: DRAUGHTS_KEYS.chat(matchId ?? "none", room),
    queryFn: () => fetchMatchChat(matchId as string, { room, limit: 100 }),
    enabled: chatEnabled,
  });

  const comments = useQuery({
    queryKey: DRAUGHTS_KEYS.comments(matchId ?? "none"),
    queryFn: () => fetchMatchComments(matchId as string),
    enabled: !!matchId && commentsEnabled,
  });

  const note = useQuery({
    queryKey: DRAUGHTS_KEYS.note(matchId ?? "none", wallet ?? "anon"),
    queryFn: () => fetchMatchNote(matchId as string, wallet as string),
    enabled: !!matchId && !!wallet && noteEnabled,
  });

  // Chat lines and comment edits ride the board's topic, so this subscription
  // folds them into their own caches as they land.
  const liveTopic = matchId ? `draughts:match:${matchId}` : null;
  useEffect(() => {
    if (!liveTopic || !matchId) return;
    return subscribeChessTopic(liveTopic, (frame) => {
      const { type, data } = frame;
      if (!data || typeof data !== "object") return;

      if (type === "chatLine") {
        const line = data as DraughtsChatMessageWire;
        // A line is only added to the room it belongs to, so the spectator feed
        // can never show what was said in the players' room.
        queryClient.setQueryData<DraughtsChatMessage[]>(
          DRAUGHTS_KEYS.chat(matchId, line.room),
          (prev) => applyChatLineFrame(prev ?? [], line)
        );
        return;
      }
      if (type === "commentUpserted") {
        if (!commentsEnabled) return;
        queryClient.setQueryData<DraughtsMatchComment[]>(DRAUGHTS_KEYS.comments(matchId), (prev) =>
          applyCommentUpsertedFrame(prev ?? [], data as DraughtsMatchCommentWire)
        );
        return;
      }
      if (type === "commentDeleted") {
        if (!commentsEnabled) return;
        queryClient.setQueryData<DraughtsMatchComment[]>(DRAUGHTS_KEYS.comments(matchId), (prev) =>
          applyCommentDeletedFrame(prev ?? [], data as DraughtsCommentDeletedFrame)
        );
      }
    });
  }, [commentsEnabled, liveTopic, matchId, queryClient]);

  const sendChat = useCallback(
    async (text: string) => {
      if (!matchId || !wallet) return;
      const line = await postMatchChatMessage(matchId, room, text, wallet);
      queryClient.setQueryData<DraughtsChatMessage[]>(DRAUGHTS_KEYS.chat(matchId, room), (prev) =>
        applyChatLineFrame(prev ?? [], { ...line, room })
      );
    },
    [matchId, wallet, room, queryClient]
  );

  const saveNote = useCallback(
    async (text: string) => {
      if (!matchId || !wallet) return;
      const saved = await saveMatchNote(matchId, wallet, text);
      queryClient.setQueryData(DRAUGHTS_KEYS.note(matchId, wallet), saved);
    },
    [matchId, wallet, queryClient]
  );

  const saveComment = useCallback(
    async (ply: number, text: string) => {
      if (!matchId || !wallet) return;
      const saved = await upsertMatchComment(matchId, wallet, { ply, text });
      queryClient.setQueryData<DraughtsMatchComment[]>(DRAUGHTS_KEYS.comments(matchId), (prev) =>
        applyCommentUpsertedFrame(prev ?? [], { ...saved })
      );
    },
    [matchId, wallet, queryClient]
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      if (!matchId || !wallet) return;
      await deleteMatchComment(matchId, commentId, wallet);
      queryClient.setQueryData<DraughtsMatchComment[]>(DRAUGHTS_KEYS.comments(matchId), (prev) =>
        (prev ?? []).filter((comment) => comment.id !== commentId)
      );
    },
    [matchId, wallet, queryClient]
  );

  return {
    chat: chat.data ?? EMPTY_CHAT,
    comments: comments.data ?? EMPTY_COMMENTS,
    note: note.data?.text ?? "",
    sendChat,
    saveNote,
    saveComment,
    removeComment,
  };
}

// Stable empty defaults, so a consumer's memo does not re-run on every render
// while a query is still pending.
const EMPTY_CHAT: DraughtsChatMessage[] = [];
const EMPTY_COMMENTS: DraughtsMatchComment[] = [];

/** The seat a wallet holds in a match, or null when they are a spectator. */
export function seatOf(match: DraughtsMatch | null, wallet: string | null): DraughtsSide | null {
  if (!match || !wallet) return null;
  const me = wallet.toLowerCase();
  if (match.white?.walletAddress.toLowerCase() === me) return "white";
  if (match.black?.walletAddress.toLowerCase() === me) return "black";
  return null;
}

/** Whose turn it is, and whether this client may act on it. */
export function useSeat(match: DraughtsMatch | null, wallet: string | null) {
  return useMemo(() => {
    const seat = seatOf(match, wallet);
    const myTurn = !!seat && match?.turn === seat && match?.state === "in_progress";
    return { seat, myTurn, spectating: !seat };
  }, [match, wallet]);
}
