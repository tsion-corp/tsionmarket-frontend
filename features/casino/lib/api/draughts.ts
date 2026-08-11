"use client";

// Read and write client for draughts. The server owns the position and the
// clocks: this client sends intended moves and renders whatever the server
// returns, so a tampered client can never manufacture a win.
//
// Every write names the player acting. The caller passes their wallet address,
// but the proxy replaces it with the address the session actually owns before
// the request leaves our origin, so the value here is a hint rather than an
// authority.

import {
  draughtsDelete,
  draughtsGet,
  draughtsPost,
  draughtsPut,
} from "@/features/casino/lib/api/draughts-client";
import {
  isMatchId,
  toDraughtsChallenge,
  toDraughtsChatMessage,
  toDraughtsMatch,
  toDraughtsMatchComment,
  toDraughtsMatchNote,
  type DraughtsChatMessageWire,
  type DraughtsMatchCommentWire,
  type DraughtsMatchNoteWire,
  type DraughtsMatchWire,
  type DraughtsMoveWire,
} from "@/features/casino/lib/api/draughts-wire";
import { apiError } from "@/lib/api/envelope";
import { parseTimeControl } from "@/features/casino/lib/time-control";
import type {
  CreateDraughtsMatchInput,
  DraughtsChallenge,
  DraughtsChatMessage,
  DraughtsChatRoom,
  DraughtsMatch,
  DraughtsMatchComment,
  DraughtsMatchNote,
  UpsertDraughtsCommentInput,
} from "@/features/casino/lib/draughts/types";

interface MatchListWire {
  items: DraughtsMatchWire[];
}

interface MovesWire {
  moves: DraughtsMoveWire[];
}

interface MoveResultWire {
  match: DraughtsMatchWire;
  move: DraughtsMoveWire;
}

interface ChatMessagesWire {
  items: DraughtsChatMessageWire[];
}

interface CommentsWire {
  items: DraughtsMatchCommentWire[];
}

// The service has no server-side expiry for waiting matches, so the public
// lobby hides seats old enough to read as abandoned. Direct invite links still
// resolve by match id.
const STALE_WAITING_MATCH_MAX_AGE_MS = 60 * 60 * 1000;

function isFreshWaitingMatch(wire: Pick<DraughtsMatchWire, "createdAt">): boolean {
  const created = Date.parse(wire.createdAt);
  return !Number.isFinite(created) || Date.now() - created <= STALE_WAITING_MATCH_MAX_AGE_MS;
}

function requireMatchId(matchId: string): string {
  if (!isMatchId(matchId)) {
    throw apiError("NOT_FOUND", "That game doesn't exist.", 404);
  }
  return matchId;
}

export async function fetchMatchMoves(matchId: string): Promise<DraughtsMoveWire[]> {
  const data = await draughtsGet<MovesWire>(`/matches/${requireMatchId(matchId)}/moves`);
  return data.moves;
}

function canReuseMoveHistory(
  previous: DraughtsMatch | null | undefined,
  wire: Pick<DraughtsMatchWire, "ply">
): previous is DraughtsMatch {
  return !!previous && previous.moves.length === wire.ply;
}

// The board and its move history are two endpoints, so they are fetched
// together on first load. After that the cached notation stays authoritative
// until the service's ply says there is a gap to repair, so the steady-state
// reconcile does not re-download /moves on every poll.
export async function fetchMatch(
  matchId: string,
  previous: DraughtsMatch | null = null
): Promise<DraughtsMatch> {
  const wire = await draughtsGet<DraughtsMatchWire>(`/matches/${requireMatchId(matchId)}`);
  if (canReuseMoveHistory(previous, wire)) {
    return toDraughtsMatch(wire, {
      moveSan: previous.moves,
      // When no new move landed, the timestamp we already have is still the
      // honest clock reference. A no-move poll must not restart the countdown.
      clockUpdatedAt: previous.clockUpdatedAt,
    });
  }
  if (wire.ply === 0) return toDraughtsMatch(wire);
  const moves = await fetchMatchMoves(matchId);
  return toDraughtsMatch(wire, { moves });
}

/** Public open seats, minus the ones stale enough to read as abandoned. */
export async function fetchOpenChallenges(): Promise<DraughtsChallenge[]> {
  const data = await draughtsGet<MatchListWire>("/matches", { status: "waiting", limit: "50" });
  return data.items.filter(isFreshWaitingMatch).map(toDraughtsChallenge);
}

export async function fetchLiveMatches(): Promise<DraughtsMatch[]> {
  const data = await draughtsGet<MatchListWire>("/matches", { status: "active", limit: "50" });
  return data.items.map((wire) => toDraughtsMatch(wire));
}

export async function fetchPlayerMatches(wallet: string): Promise<DraughtsMatch[]> {
  const data = await draughtsGet<MatchListWire>(`/players/${encodeURIComponent(wallet)}/matches`, {
    limit: "50",
  });
  return data.items.map((wire) => toDraughtsMatch(wire));
}

export async function createMatch(
  input: CreateDraughtsMatchInput,
  creator: string
): Promise<DraughtsMatch> {
  const { initialSeconds, incrementSeconds } = parseTimeControl(input.timeControl);
  const wire = await draughtsPost<DraughtsMatchWire>("/matches", {
    creator,
    color: input.color ?? "random",
    // Only the two implemented variants are ever sent. A starting position
    // makes it from_position; anything else is the standard game.
    variant: input.startingFen ? "from_position" : "standard",
    ...(input.startingFen ? { startingFen: input.startingFen } : {}),
    initialSeconds,
    incrementSeconds,
    ...(input.stakeUsdc ? { stakeUsdc: input.stakeUsdc } : {}),
  });
  return toDraughtsMatch(wire);
}

export async function joinMatch(matchId: string, player: string): Promise<DraughtsMatch> {
  const wire = await draughtsPost<DraughtsMatchWire>(`/matches/${requireMatchId(matchId)}/join`, {
    player,
  });
  return toDraughtsMatch(wire);
}

/**
 * Submit a move. `uci` is every square in the path, two digits each, so a
 * multi-jump is one request rather than one per hop.
 */
export async function submitMove(
  matchId: string,
  player: string,
  uci: string,
  previous: DraughtsMatch | null = null
): Promise<DraughtsMatch> {
  const result = await draughtsPost<MoveResultWire>(`/matches/${requireMatchId(matchId)}/moves`, {
    player,
    uci,
  });
  // The response carries the move that was just applied, so the history can be
  // extended in place instead of refetched.
  const moveSan =
    previous && previous.moves.length === result.match.ply - 1
      ? [...previous.moves, result.move.san]
      : undefined;
  return toDraughtsMatch(result.match, {
    ...(moveSan ? { moveSan } : {}),
    clockUpdatedAt: result.move.createdAt,
  });
}

async function action(matchId: string, path: string, body: Record<string, unknown>) {
  const wire = await draughtsPost<DraughtsMatchWire>(
    `/matches/${requireMatchId(matchId)}/${path}`,
    body
  );
  return toDraughtsMatch(wire);
}

export function resignMatch(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "resign", { player });
}

export function offerDraw(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "draw-offer", { player });
}

export function respondToDraw(
  matchId: string,
  player: string,
  accept: boolean
): Promise<DraughtsMatch> {
  return action(matchId, "draw-response", { player, accept });
}

export function claimDraw(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "claim-draw", { player });
}

export function claimTimeout(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "claim-timeout", { player });
}

export function abortMatch(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "abort", { player });
}

export function requestRematch(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "rematch", { player });
}

export function declineRematch(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "rematch-decline", { player });
}

export function requestTakeback(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "takeback", { player });
}

export function declineTakeback(matchId: string, player: string): Promise<DraughtsMatch> {
  return action(matchId, "takeback-decline", { player });
}

export async function fetchPdn(matchId: string): Promise<string> {
  const data = await draughtsGet<{ pdn: string }>(`/matches/${requireMatchId(matchId)}/pdn`);
  return data.pdn;
}

export async function fetchMatchChat(
  matchId: string,
  query: { room?: DraughtsChatRoom; limit?: number } = {}
): Promise<DraughtsChatMessage[]> {
  const params: Record<string, string> = {};
  if (query.room) params.room = query.room;
  if (query.limit) params.limit = String(query.limit);
  const data = await draughtsGet<ChatMessagesWire>(
    `/matches/${requireMatchId(matchId)}/chat`,
    params,
    // The player room is private to the two seats, so it needs the session.
    { requireAuth: query.room === "player" }
  );
  return data.items.map(toDraughtsChatMessage);
}

export async function postMatchChatMessage(
  matchId: string,
  room: DraughtsChatRoom,
  text: string,
  author: string
): Promise<DraughtsChatMessage> {
  const wire = await draughtsPost<DraughtsChatMessageWire>(
    `/matches/${requireMatchId(matchId)}/chat`,
    { author, room, text }
  );
  return toDraughtsChatMessage(wire);
}

export async function fetchMatchNote(matchId: string, player: string): Promise<DraughtsMatchNote> {
  const wire = await draughtsGet<DraughtsMatchNoteWire>(
    `/matches/${requireMatchId(matchId)}/note`,
    { player },
    { requireAuth: true }
  );
  return toDraughtsMatchNote(wire);
}

export async function saveMatchNote(
  matchId: string,
  player: string,
  text: string
): Promise<DraughtsMatchNote> {
  const wire = await draughtsPut<DraughtsMatchNoteWire>(
    `/matches/${requireMatchId(matchId)}/note`,
    { player, text }
  );
  return toDraughtsMatchNote(wire);
}

/** Every comment on the match, or just the ones pinned to one ply. */
export async function fetchMatchComments(
  matchId: string,
  ply?: number
): Promise<DraughtsMatchComment[]> {
  const data = await draughtsGet<CommentsWire>(
    `/matches/${requireMatchId(matchId)}/comments`,
    ply === undefined ? undefined : { ply: String(ply) }
  );
  return data.items.map(toDraughtsMatchComment);
}

export async function upsertMatchComment(
  matchId: string,
  player: string,
  input: UpsertDraughtsCommentInput
): Promise<DraughtsMatchComment> {
  const wire = await draughtsPost<DraughtsMatchCommentWire>(
    `/matches/${requireMatchId(matchId)}/comments`,
    { player, ply: input.ply, text: input.text }
  );
  return toDraughtsMatchComment(wire);
}

export async function deleteMatchComment(
  matchId: string,
  commentId: string,
  player: string
): Promise<void> {
  await draughtsDelete(`/matches/${requireMatchId(matchId)}/comments/${commentId}`, { player });
}
