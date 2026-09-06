"use client";

import { chessDelete, chessGet, chessPost, chessPut } from "@/features/casino/lib/api/chess-client";
// Shared with the dashboard feed on the server; see lib/chess/live-match.
import { isPlausiblyActiveMatch } from "@/lib/chess/live-match";
import {
  applyChatLineFrame,
  applyCommentDeletedFrame,
  applyCommentUpsertedFrame,
  isMatchId,
  parseTimeControl,
  toChessCoachProgress,
  toChessChatMessage,
  toChessMatchComment,
  toChessMatchAnalysis,
  toChessMatchNote,
  toChessChallenge,
  toChessMatch,
  toChessWeaknessProfile,
  type ChessChatMessageWire,
  type ChessCoachProgressWire,
  type ChessChatMessagesWire,
  type ChessCommentDeletedFrame,
  type ChessMatchAnalysisWire,
  type ChessMatchWire,
  type ChessMatchCommentWire,
  type ChessMatchCommentsWire,
  type ChessMatchNoteWire,
  type ChessMoveWire,
  type ChessWeaknessProfileWire,
} from "@/features/casino/lib/api/chess-wire";
import { apiError, errorCode } from "@/lib/api/envelope";
import type {
  ChessChatMessage,
  ChessChatRoom,
  ChessChallenge,
  ChessCoachProgress,
  ChessCoachCatalog,
  ChessCoachExperience,
  ChessCoachPreferredMode,
  ChessCoachHome,
  ChessCoachHint,
  ChessCoachLessonAttempt,
  ChessCoachMoveReview,
  ChessComputerCoachState,
  ChessCoachTraining,
  ChessCoachTrainingAttempt,
  ChessComputerHint,
  CreateComputerMatchInput,
  ChessMatchAnalysis,
  ChessMatch,
  ChessMatchComment,
  ChessMatchNote,
  ChessVideoAccess,
  ChessWeaknessProfile,
  CreateChessChallengeInput,
  MatchmakingTicket,
} from "@/features/casino/lib/api/types";

// Read and write client for chess. The server owns the position and the clocks:
// this client sends intended moves and renders whatever the server returns, so
// a tampered client can never manufacture a win.
//
// Every write names the player acting. The caller passes their wallet address,
// but the proxy replaces it with the address the session actually owns before
// the request leaves our origin, so the value here is a hint rather than an
// authority.

interface MatchListWire {
  items: ChessMatchWire[];
}

interface MovesWire {
  moves: ChessMoveWire[];
}

interface MoveResultWire {
  match: ChessMatchWire;
  move: ChessMoveWire;
}

type ChessCoachMoveReviewWire = Omit<ChessCoachMoveReview, "matchState"> & {
  matchState: ChessMatchWire | null;
};

function toChessCoachMoveReview(wire: ChessCoachMoveReviewWire): ChessCoachMoveReview {
  return {
    ...wire,
    matchState: wire.matchState ? toChessMatch(wire.matchState) : null,
  };
}

interface MatchChatQuery {
  room?: ChessChatRoom;
  limit?: number;
}

type UpsertMatchCommentInput = {
  ply: number;
  text: string;
};

export interface LobbyChallenges {
  challenges: ChessChallenge[];
  myOpenGames: ChessChallenge[];
}

export interface UpsertCoachProgressInput {
  lessonKey: string;
  chapterKey: string;
  score: number;
  completed: boolean;
}

// The service has no server-side expiry for waiting matches, so the public
// lobby and quick-match path hide seats that are old enough to read as
// abandoned. Direct invite links still resolve by match id.
const STALE_WAITING_MATCH_MAX_AGE_MS = 60 * 60 * 1000;
function isFreshWaitingMatch(wire: Pick<ChessMatchWire, "createdAt">): boolean {
  const created = Date.parse(wire.createdAt);
  return !Number.isFinite(created) || Date.now() - created <= STALE_WAITING_MATCH_MAX_AGE_MS;
}

function requireMatchId(matchId: string): string {
  if (!isMatchId(matchId)) {
    throw apiError("NOT_FOUND", "That game doesn't exist.", 404);
  }
  return matchId;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

async function fetchMatchWire(matchId: string): Promise<ChessMatchWire> {
  return chessGet<ChessMatchWire>(`/matches/${requireMatchId(matchId)}`);
}

export async function fetchMatchMoves(matchId: string): Promise<ChessMoveWire[]> {
  const data = await chessGet<MovesWire>(`/matches/${requireMatchId(matchId)}/moves`);
  return data.moves;
}

function canReuseMoveHistory(
  previous: ChessMatch | null | undefined,
  wire: Pick<ChessMatchWire, "ply">
): previous is ChessMatch {
  return !!previous && previous.moves.length === wire.ply;
}

function preserveOptionalMatchState(
  previous: ChessMatch | null,
  wire: ChessMatchWire,
  incoming: ChessMatch
): ChessMatch {
  if (!previous || wire.timeExtensions) return incoming;
  return { ...incoming, timeExtensions: previous.timeExtensions };
}

// The board and its move history are two endpoints, so they are fetched
// together on first load. After that, the cached SAN list stays authoritative
// until the service's ply says there is a gap to repair, so the steady-state
// reconcile path does not re-download `/moves` on every poll.
export async function fetchMatch(
  matchId: string,
  previous: ChessMatch | null = null
): Promise<ChessMatch> {
  requireMatchId(matchId);
  const wire = await fetchMatchWire(matchId);
  if (canReuseMoveHistory(previous, wire)) {
    const justStarted = previous.state === "awaiting_opponent" && wire.status === "active";
    return preserveOptionalMatchState(
      previous,
      wire,
      toChessMatch(wire, {
        moveSan: previous.moves,
        // When no new move landed, the last move timestamp we already have is
        // still the honest clock reference. A no-move poll must not restart the
        // displayed countdown.
        // A waiting snapshot is anchored at game creation. Reusing it after join
        // charges the creator for time spent sharing the invite link.
        clockUpdatedAt: justStarted ? undefined : previous.clockUpdatedAt,
      })
    );
  }
  if (wire.ply === 0) return preserveOptionalMatchState(previous, wire, toChessMatch(wire));
  const moves = await fetchMatchMoves(matchId);
  return preserveOptionalMatchState(previous, wire, toChessMatch(wire, { moves }));
}

// Public open seats. Old waiting games read as abandoned in the lobby, so the
// public list hides them even if the backend has not cleaned them up yet.
export async function fetchOpenChallenges(): Promise<ChessChallenge[]> {
  const data = await chessGet<MatchListWire>("/matches", { status: "waiting", limit: "50" });
  return data.items.filter(isFreshWaitingMatch).map((wire) => toChessChallenge(wire));
}

export async function fetchLiveMatches(): Promise<ChessMatch[]> {
  const data = await chessGet<MatchListWire>("/matches", { status: "active", limit: "50" });
  return data.items
    .filter((wire) => !wire.computer && isPlausiblyActiveMatch(wire))
    .map((wire) => toChessMatch(wire));
}

// Every game sitting open, as the service reports it.
export async function fetchWaitingMatches(): Promise<ChessMatchWire[]> {
  const data = await chessGet<MatchListWire>("/matches", { status: "waiting", limit: "50" });
  return data.items;
}

// The lobby treats the viewer's own open game differently from everybody
// else's: it must stay resumable even if it is old, while stale public seats
// stay hidden so the challenge list does not fill with abandoned games.
export async function fetchLobbyChallenges(wallet: string | null): Promise<LobbyChallenges> {
  const mine = wallet?.toLowerCase() ?? null;
  const matches = await fetchWaitingMatches();
  const challenges: ChessChallenge[] = [];
  const myOpenGames: ChessChallenge[] = [];

  for (const match of matches) {
    const mineOnThisMatch =
      !!mine && (match.white?.toLowerCase() === mine || match.black?.toLowerCase() === mine);
    const challenge = toChessChallenge(match);
    if (mineOnThisMatch) {
      myOpenGames.push(challenge);
    } else if (isFreshWaitingMatch(match)) {
      challenges.push(challenge);
    }
  }

  return { challenges, myOpenGames };
}

// Waiting games this player could join. Their own open games are excluded: the
// service would reject the join, and offering it reads as a bug.
export async function fetchJoinableMatches(wallet: string): Promise<ChessMatchWire[]> {
  const mine = wallet.toLowerCase();
  return (await fetchWaitingMatches()).filter(
    (m) =>
      isFreshWaitingMatch(m) && m.white?.toLowerCase() !== mine && m.black?.toLowerCase() !== mine
  );
}

// An invite link carries the match id, so resolving one is just reading the
// game. There are no separate invite codes on this service.
export async function fetchChallengeByInvite(inviteCode: string): Promise<ChessChallenge> {
  const wire = await fetchMatchWire(inviteCode);
  return toChessChallenge(wire);
}

// Opens a game and returns it as a challenge to share. "auto" mode also returns
// a ticket so the matchmaking screen has something to follow; there is no queue
// on this service, so the ticket is the match itself waiting to be joined.
//
// A stake makes it a wager-backed match: the cashier locks that much of the
// creator's available USDC immediately, and the joiner's on join. Omitted for
// a free game, so the request stays byte-identical to what an unstaked create
// always sent.
export async function createChallenge(
  input: CreateChessChallengeInput & { creator: string; stakeUsdc?: string | null }
): Promise<{ challenge: ChessChallenge; match: ChessMatch; ticket: MatchmakingTicket | null }> {
  const { initialSeconds, incrementSeconds } = parseTimeControl(input.timeControl);
  const wire = await chessPost<ChessMatchWire>("/matches", {
    creator: input.creator,
    color: "random",
    initial_seconds: initialSeconds,
    increment_seconds: incrementSeconds,
    // Rating is a property of human PvP, not of whether USDC is at stake.
    rated: true,
    allow_time_extensions: input.allowTimeExtensions ?? false,
    // Every human match gets an Ark Stream room. Individual players can still
    // leave camera and microphone from the board.
    videoEnabled: true,
    ...(input.stakeUsdc ? { stake_usdc: input.stakeUsdc } : {}),
  });

  return {
    challenge: toChessChallenge(wire),
    match: toChessMatch(wire),
    ticket:
      input.mode === "auto"
        ? {
            id: wire.id,
            state: "searching",
            matchId: wire.id,
            acceptSecondsRemaining: null,
            opponent: null,
          }
        : null,
  };
}

export async function issueMatchVideoToken(
  matchId: string,
  player?: string
): Promise<ChessVideoAccess> {
  return chessPost<ChessVideoAccess>(
    `/matches/${requireMatchId(matchId)}/video/token`,
    player ? { player } : {}
  );
}

export async function createComputerMatch(
  input: CreateComputerMatchInput & { player: string; idempotencyKey?: string }
): Promise<ChessMatch> {
  const wire = await chessPost<ChessMatchWire>("/computer/matches", {
    player: input.player,
    level: input.level,
    color: input.color,
    time_mode: input.timeMode,
    ...(input.timeMode === "real_time"
      ? {
          initial_seconds: input.initialSeconds,
          increment_seconds: input.incrementSeconds,
        }
      : {}),
    ...(input.stakeUsdc ? { stake_usdc: input.stakeUsdc } : {}),
    ...(input.coachEnabled ? { coach_enabled: true } : {}),
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  });
  return toChessMatch(wire);
}

export async function requestComputerHint(
  matchId: string,
  player: string,
  idempotencyKey: string
): Promise<ChessComputerHint> {
  return chessPost<ChessComputerHint>(`/computer/matches/${requireMatchId(matchId)}/hint`, {
    player,
    idempotencyKey,
  });
}

export async function fetchComputerCoachState(
  matchId: string,
  player: string
): Promise<ChessComputerCoachState> {
  return chessGet<ChessComputerCoachState>(`/computer/matches/${requireMatchId(matchId)}/coach`, {
    player,
  });
}

export async function requestComputerCoachMove(
  matchId: string,
  player: string,
  uci: string,
  expectedPly: number,
  idempotencyKey: string
): Promise<ChessCoachMoveReview> {
  const wire = await chessPost<ChessCoachMoveReviewWire>(
    `/computer/matches/${requireMatchId(matchId)}/coach/move`,
    { player, uci, expectedPly, idempotencyKey }
  );
  return toChessCoachMoveReview(wire);
}

export async function continueComputerCoachReview(
  matchId: string,
  player: string,
  attemptId: string,
  expectedPly: number
): Promise<ChessCoachMoveReview> {
  const wire = await chessPost<ChessCoachMoveReviewWire>(
    `/computer/matches/${requireMatchId(matchId)}/coach/continue`,
    { player, attemptId, expectedPly }
  );
  return toChessCoachMoveReview(wire);
}

export async function undoComputerCoachReview(
  matchId: string,
  player: string,
  attemptId: string,
  expectedPly: number
): Promise<ChessCoachMoveReview> {
  const wire = await chessPost<ChessCoachMoveReviewWire>(
    `/computer/matches/${requireMatchId(matchId)}/coach/undo`,
    { player, attemptId, expectedPly }
  );
  return toChessCoachMoveReview(wire);
}

export async function requestComputerCoachHint(
  matchId: string,
  player: string,
  expectedPly: number,
  idempotencyKey: string
): Promise<ChessCoachHint> {
  return chessPost<ChessCoachHint>(`/computer/matches/${requireMatchId(matchId)}/coach/hint`, {
    player,
    expectedPly,
    idempotencyKey,
  });
}

export async function extendMatchTime(
  matchId: string,
  player: string,
  seconds: 60 | 300 | 600,
  idempotencyKey: string
): Promise<ChessMatch> {
  const wire = await chessPost<ChessMatchWire>(
    `/matches/${requireMatchId(matchId)}/time-extension`,
    { player, seconds, idempotencyKey }
  );
  return toChessMatch(wire);
}

// Abandoning a game you opened. The service calls it aborting, which is also
// what a player does to a game nobody joined.
export async function cancelChallenge(challengeId: string, player: string): Promise<void> {
  await chessPost(`/matches/${requireMatchId(challengeId)}/abort`, { player });
}

export async function acceptChallenge(challengeId: string, player: string): Promise<ChessMatch> {
  const wire = await chessPost<ChessMatchWire>(`/matches/${requireMatchId(challengeId)}/join`, {
    player,
  });
  return toChessMatch(wire);
}

// Polling a "ticket" is polling the match the player opened, which is matched
// the moment somebody joins it.
export async function fetchMatchmakingTicket(ticketId: string): Promise<MatchmakingTicket> {
  const wire = await fetchMatchWire(ticketId);
  const opponentWallet = wire.white && wire.black ? wire.black : null;
  return {
    id: wire.id,
    state:
      wire.status === "waiting" ? "searching" : wire.status === "active" ? "matched" : "expired",
    matchId: wire.id,
    acceptSecondsRemaining: null,
    opponent: opponentWallet
      ? {
          id: opponentWallet,
          username: opponentWallet,
          rating: null,
          walletAddress: opponentWallet,
        }
      : null,
  };
}

export async function cancelMatchmaking(ticketId: string, player: string): Promise<void> {
  await cancelChallenge(ticketId, player);
}

// Submits a move in coordinate notation ("e2e4", with a promotion suffix like
// "e7e8q"). The server validates legality and returns the new authoritative
// state; an illegal move throws and the board stays put.
//
// The response carries the applied move as well as the new position, so the
// move list is the history the caller already had with this move appended,
// rather than a second request for the whole thing. Slicing to the new ply
// keeps the list right even if the caller's copy was behind.
export async function submitMove(
  matchId: string,
  move: string,
  player: string,
  previousSan: string[] = []
): Promise<ChessMatch> {
  const result = await chessPost<MoveResultWire>(`/matches/${requireMatchId(matchId)}/moves`, {
    player,
    uci: move,
  });
  const match = toChessMatch(result.match, { moves: [result.move] });
  return {
    ...match,
    moves: [...previousSan.slice(0, Math.max(0, result.move.ply - 1)), result.move.san],
  };
}

async function playerAction(matchId: string, action: string, player: string): Promise<ChessMatch> {
  const wire = await chessPost<ChessMatchWire>(`/matches/${requireMatchId(matchId)}/${action}`, {
    player,
  });
  return toChessMatch(wire);
}

export async function resignMatch(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "resign", player);
}

export async function offerDraw(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "draw-offer", player);
}

// Answers an outstanding offer. Declining leaves the game running.
export async function respondToDraw(
  matchId: string,
  player: string,
  accept: boolean
): Promise<ChessMatch> {
  const wire = await chessPost<ChessMatchWire>(
    `/matches/${requireMatchId(matchId)}/draw-response`,
    { player, accept }
  );
  return toChessMatch(wire);
}

// Claims a draw the position already entitles the player to, by repetition or
// the fifty-move rule.
export async function claimDraw(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "claim-draw", player);
}

// Flags an opponent whose clock has run out. The service does not end a game on
// time by itself, so without this call a game whose clock expired would sit
// unfinished forever.
export async function claimTimeout(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "claim-timeout", player);
}

export async function abortMatch(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "abort", player);
}

// Lila-style rematch "yes": the first click offers, the second accepts and the
// response carries the original match plus `rematch.nextMatchId`.
export async function requestRematch(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "rematch", player);
}

export async function declineRematch(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "rematch-decline", player);
}

// Lila-style takeback "yes": the first click offers, the second accepts and
// rewinds the current game.
export async function requestTakeback(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "takeback", player);
}

export async function declineTakeback(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "takeback-decline", player);
}

export async function fetchPgn(matchId: string): Promise<string> {
  const data = await chessGet<{ pgn: string }>(`/matches/${requireMatchId(matchId)}/pgn`);
  return data.pgn;
}

export async function fetchMatchAnalysis(matchId: string): Promise<ChessMatchAnalysis | null> {
  try {
    const wire = await chessGet<ChessMatchAnalysisWire>(
      `/matches/${requireMatchId(matchId)}/analysis`
    );
    return toChessMatchAnalysis(wire);
  } catch (error) {
    if (
      errorCode(error) === "NOT_FOUND" &&
      errorMessage(error).trim().toLowerCase() === "analysis not found"
    ) {
      return null;
    }
    throw error;
  }
}

export async function requestMatchAnalysis(
  matchId: string,
  player: string,
  options: { premium?: boolean; idempotencyKey?: string } = {}
): Promise<ChessMatchAnalysis> {
  const wire = await chessPost<ChessMatchAnalysisWire>(
    `/matches/${requireMatchId(matchId)}/analysis/request`,
    {
      player,
      premium: options.premium ?? false,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    }
  );
  return toChessMatchAnalysis(wire);
}

export async function fetchPlayerWeaknessProfile(
  player: string,
  limit = 5
): Promise<ChessWeaknessProfile> {
  const wire = await chessGet<ChessWeaknessProfileWire>(
    `/players/${encodeURIComponent(player)}/insights`,
    { limit }
  );
  return toChessWeaknessProfile(wire);
}

export async function fetchCoachProgress(player: string): Promise<ChessCoachProgress> {
  const wire = await chessGet<ChessCoachProgressWire>(
    `/players/${encodeURIComponent(player)}/coach-progress`
  );
  return toChessCoachProgress(wire);
}

export async function fetchCoachCatalog(): Promise<ChessCoachCatalog> {
  return chessGet<ChessCoachCatalog>("/coach/catalog");
}

export async function fetchCoachHome(player: string): Promise<ChessCoachHome> {
  return chessGet<ChessCoachHome>(`/players/${encodeURIComponent(player)}/coach/home`);
}

export async function updateCoachProfile(
  player: string,
  input: {
    experience: ChessCoachExperience;
    onboardingComplete: boolean;
    preferredMode: ChessCoachPreferredMode;
  }
): Promise<ChessCoachHome["profile"]> {
  return chessPut<ChessCoachHome["profile"]>(
    `/players/${encodeURIComponent(player)}/coach/profile`,
    input
  );
}

export async function fetchCoachTraining(player: string, limit = 20): Promise<ChessCoachTraining> {
  return chessGet<ChessCoachTraining>(`/players/${encodeURIComponent(player)}/coach/training`, {
    limit,
  });
}

export async function attemptCoachLesson(
  lessonKey: string,
  chapterKey: string,
  player: string,
  uci: string,
  idempotencyKey: string
): Promise<ChessCoachLessonAttempt> {
  return chessPost<ChessCoachLessonAttempt>(
    `/coach/lessons/${encodeURIComponent(lessonKey)}/chapters/${encodeURIComponent(chapterKey)}/attempt`,
    { player, uci, idempotencyKey }
  );
}

export async function attemptCoachTraining(
  player: string,
  matchId: string,
  ply: number,
  uci: string,
  idempotencyKey: string
): Promise<ChessCoachTrainingAttempt> {
  return chessPost<ChessCoachTrainingAttempt>(
    `/players/${encodeURIComponent(player)}/coach/training/${requireMatchId(matchId)}/${ply}/attempt`,
    { uci, idempotencyKey }
  );
}

export async function saveCoachProgress(
  player: string,
  input: UpsertCoachProgressInput
): Promise<ChessCoachProgress> {
  const wire = await chessPut<ChessCoachProgressWire>(
    `/players/${encodeURIComponent(player)}/coach-progress`,
    {
      lesson_key: input.lessonKey,
      chapter_key: input.chapterKey,
      score: input.score,
      completed: input.completed,
    }
  );
  return toChessCoachProgress(wire);
}

export async function fetchPlayerMatches(wallet: string, status?: string): Promise<ChessMatch[]> {
  const data = await chessGet<MatchListWire>(`/players/${encodeURIComponent(wallet)}/matches`, {
    limit: "50",
    ...(status ? { status } : {}),
  });
  return data.items.map((wire) => toChessMatch(wire));
}

// The social surfaces (chat, note, comments) are gated by the service behind
// "are you a player in this match", the same seat check as moves. On a managed
// Swiss-tournament board a seat is the player's display name, not their wallet,
// so every one of these carries an optional `seat`: when set it names the
// tournament seat as the caller (the proxy passes a non-wallet identity through
// untouched), and when null the caller is the wallet the proxy stamps. Ordinary
// wallet-seated games pass null and their requests are unchanged.
export async function fetchMatchChat(
  matchId: string,
  query: MatchChatQuery = {},
  seat: string | null = null
): Promise<ChessChatMessage[]> {
  const room = query.room ?? "spectator";
  const data = await chessGet<ChessChatMessagesWire>(
    `/matches/${requireMatchId(matchId)}/chat`,
    {
      room,
      ...(query.limit ? { limit: String(query.limit) } : {}),
      ...(room === "player" && seat ? { player: seat } : {}),
    },
    { requireAuth: room === "player" }
  );
  return data.items.map((wire) => toChessChatMessage(wire));
}

export async function postMatchChatMessage(
  matchId: string,
  room: ChessChatRoom,
  text: string,
  seat: string | null = null
): Promise<ChessChatMessage> {
  const wire = await chessPost<ChessChatMessageWire>(`/matches/${requireMatchId(matchId)}/chat`, {
    room,
    text,
    ...(seat ? { author: seat } : {}),
  });
  return toChessChatMessage(wire);
}

export async function fetchMatchNote(
  matchId: string,
  seat: string | null = null
): Promise<ChessMatchNote> {
  const wire = await chessGet<ChessMatchNoteWire>(
    `/matches/${requireMatchId(matchId)}/note`,
    seat ? { player: seat } : undefined,
    { requireAuth: true }
  );
  return toChessMatchNote(wire);
}

export async function saveMatchNote(
  matchId: string,
  text: string,
  seat: string | null = null
): Promise<ChessMatchNote> {
  const wire = await chessPut<ChessMatchNoteWire>(`/matches/${requireMatchId(matchId)}/note`, {
    text,
    ...(seat ? { player: seat } : {}),
  });
  return toChessMatchNote(wire);
}

export async function fetchMatchComments(
  matchId: string,
  ply?: number
): Promise<ChessMatchComment[]> {
  const data = await chessGet<ChessMatchCommentsWire>(
    `/matches/${requireMatchId(matchId)}/comments`,
    {
      ...(typeof ply === "number" ? { ply: String(ply) } : {}),
    }
  );
  return data.items.map((wire) => toChessMatchComment(wire));
}

export async function upsertMatchComment(
  matchId: string,
  input: UpsertMatchCommentInput,
  seat: string | null = null
): Promise<ChessMatchComment> {
  const wire = await chessPost<ChessMatchCommentWire>(
    `/matches/${requireMatchId(matchId)}/comments`,
    { ...input, ...(seat ? { player: seat } : {}) }
  );
  return toChessMatchComment(wire);
}

export async function deleteMatchComment(
  matchId: string,
  commentId: string,
  seat: string | null = null
): Promise<ChessMatchComment> {
  const wire = await chessDelete<ChessMatchCommentWire>(
    `/matches/${requireMatchId(matchId)}/comments/${encodeURIComponent(commentId)}`,
    seat ? { player: seat } : {}
  );
  return toChessMatchComment(wire);
}

export { applyChatLineFrame, applyCommentDeletedFrame, applyCommentUpsertedFrame };
export type { ChessCommentDeletedFrame };
