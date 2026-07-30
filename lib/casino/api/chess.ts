"use client";

import { casinoGet, casinoPost } from "@/lib/casino/api/client";
import type {
  ChessChallenge,
  ChessMatch,
  CreateChessChallengeInput,
  MatchmakingTicket,
} from "@/lib/casino/api/types";

// Read and write client for staked chess. The server owns the position and
// the clocks: this client sends intended moves and renders whatever the
// server returns, so a tampered client can never manufacture a win.

export async function fetchOpenChallenges(): Promise<ChessChallenge[]> {
  const data = await casinoGet<{ challenges: ChessChallenge[] }>("/chess/challenges");
  return data.challenges;
}

export async function fetchLiveMatches(): Promise<ChessMatch[]> {
  const data = await casinoGet<{ matches: ChessMatch[] }>("/chess/matches", {
    state: "in_progress",
  });
  return data.matches;
}

export async function fetchMatch(matchId: string): Promise<ChessMatch> {
  return casinoGet<ChessMatch>(`/chess/matches/${encodeURIComponent(matchId)}`);
}

export async function fetchChallengeByInvite(inviteCode: string): Promise<ChessChallenge> {
  return casinoGet<ChessChallenge>(`/chess/invites/${encodeURIComponent(inviteCode)}`);
}

// Creates a challenge and escrows the creator's stake. Returns the challenge
// so the caller can show its invite link, or the matchmaking ticket when the
// mode is "auto".
export async function createChallenge(
  input: CreateChessChallengeInput
): Promise<{ challenge: ChessChallenge; ticket: MatchmakingTicket | null }> {
  return casinoPost("/chess/challenges", input);
}

export async function cancelChallenge(challengeId: string): Promise<void> {
  await casinoPost(`/chess/challenges/${encodeURIComponent(challengeId)}/cancel`);
}

// Accepts a challenge, escrows the joiner's stake, and returns the match that
// starts as a result.
export async function acceptChallenge(challengeId: string): Promise<ChessMatch> {
  return casinoPost<ChessMatch>(`/chess/challenges/${encodeURIComponent(challengeId)}/accept`);
}

export async function fetchMatchmakingTicket(ticketId: string): Promise<MatchmakingTicket> {
  return casinoGet<MatchmakingTicket>(`/chess/matchmaking/${encodeURIComponent(ticketId)}`);
}

export async function cancelMatchmaking(ticketId: string): Promise<void> {
  await casinoPost(`/chess/matchmaking/${encodeURIComponent(ticketId)}/cancel`);
}

// Submits a move in coordinate notation ("e2e4", with a promotion suffix like
// "e7e8q"). The server validates legality and returns the new authoritative
// match state; an illegal move throws ILLEGAL_MOVE and the board stays put.
export async function submitMove(matchId: string, move: string): Promise<ChessMatch> {
  return casinoPost<ChessMatch>(`/chess/matches/${encodeURIComponent(matchId)}/moves`, { move });
}

export async function resignMatch(matchId: string): Promise<ChessMatch> {
  return casinoPost<ChessMatch>(`/chess/matches/${encodeURIComponent(matchId)}/resign`);
}

// Offers a draw, or accepts one the opponent already offered. Agreement
// settles the game as a draw and starts the rematch.
export async function offerDraw(matchId: string): Promise<ChessMatch> {
  return casinoPost<ChessMatch>(`/chess/matches/${encodeURIComponent(matchId)}/offer-draw`);
}
