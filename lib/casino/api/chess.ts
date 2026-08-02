"use client";

import { chessGet, chessPost } from "@/lib/casino/api/chess-client";
import {
  isMatchId,
  parseTimeControl,
  toChessChallenge,
  toChessMatch,
  type ChessMatchWire,
  type ChessMoveWire,
} from "@/lib/casino/api/chess-wire";
import { apiError } from "@/lib/casino/api/envelope";
import type {
  ChessChallenge,
  ChessMatch,
  CreateChessChallengeInput,
  MatchmakingTicket,
} from "@/lib/casino/api/types";

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

export interface LobbyChallenges {
  challenges: ChessChallenge[];
  myOpenGames: ChessChallenge[];
}

// The service has no server-side expiry for waiting matches, so the public
// lobby and quick-match path hide seats that are old enough to read as
// abandoned. Direct invite links still resolve by match id.
const STALE_WAITING_MATCH_MAX_AGE_MS = 60 * 60 * 1000;
// A match marked `active` cannot legitimately outlive its total available
// clock budget: both starting banks plus every increment that could have been
// awarded across the moves already played. If it does, the backend left it
// "live" after it should have timed out, so the lobby hides it.
const STALE_ACTIVE_MATCH_GRACE_MS = 30 * 1000;

function isFreshWaitingMatch(wire: Pick<ChessMatchWire, "createdAt">): boolean {
  const created = Date.parse(wire.createdAt);
  return !Number.isFinite(created) || Date.now() - created <= STALE_WAITING_MATCH_MAX_AGE_MS;
}

function isPlausiblyActiveMatch(
  wire: Pick<ChessMatchWire, "createdAt" | "startedAt" | "timeControl" | "ply">
): boolean {
  const started = Date.parse(wire.startedAt ?? wire.createdAt);
  if (!Number.isFinite(started)) return true;

  const initial = wire.timeControl.initialSeconds;
  const increment = wire.timeControl.incrementSeconds;
  const ply = Math.max(0, wire.ply);
  if (!Number.isFinite(initial) || !Number.isFinite(increment)) return true;

  const maxLiveAgeMs = (initial * 2 + increment * ply) * 1000 + STALE_ACTIVE_MATCH_GRACE_MS;
  return Date.now() - started <= maxLiveAgeMs;
}

function requireMatchId(matchId: string): string {
  if (!isMatchId(matchId)) {
    throw apiError("NOT_FOUND", "That game doesn't exist.", 404);
  }
  return matchId;
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
    return toChessMatch(wire, {
      moveSan: previous.moves,
      // When no new move landed, the last move timestamp we already have is
      // still the honest clock reference. A no-move poll must not restart the
      // displayed countdown.
      clockUpdatedAt: previous.clockUpdatedAt,
    });
  }
  if (wire.ply === 0) return toChessMatch(wire);
  const moves = await fetchMatchMoves(matchId);
  return toChessMatch(wire, { moves });
}

// Public open seats. Old waiting games read as abandoned in the lobby, so the
// public list hides them even if the backend has not cleaned them up yet.
export async function fetchOpenChallenges(): Promise<ChessChallenge[]> {
  const data = await chessGet<MatchListWire>("/matches", { status: "waiting", limit: "50" });
  return data.items.filter(isFreshWaitingMatch).map((wire) => toChessChallenge(wire));
}

export async function fetchLiveMatches(): Promise<ChessMatch[]> {
  const data = await chessGet<MatchListWire>("/matches", { status: "active", limit: "50" });
  return data.items.filter(isPlausiblyActiveMatch).map((wire) => toChessMatch(wire));
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
      ? { id: opponentWallet, username: opponentWallet, rating: 0, walletAddress: opponentWallet }
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

// Starts a fresh game between the same players with the colours swapped, and
// returns that new game.
export async function requestRematch(matchId: string, player: string): Promise<ChessMatch> {
  return playerAction(matchId, "rematch", player);
}

export async function fetchPgn(matchId: string): Promise<string> {
  const data = await chessGet<{ pgn: string }>(`/matches/${requireMatchId(matchId)}/pgn`);
  return data.pgn;
}

export async function fetchPlayerMatches(wallet: string, status?: string): Promise<ChessMatch[]> {
  const data = await chessGet<MatchListWire>(`/players/${encodeURIComponent(wallet)}/matches`, {
    limit: "50",
    ...(status ? { status } : {}),
  });
  return data.items.map((wire) => toChessMatch(wire));
}
