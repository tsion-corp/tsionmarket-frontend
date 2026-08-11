// Domain types for draughts. Pure data: nothing here imports the framework,
// the transport, or the service's wire shapes. Components and hooks only ever
// see these, so a change to the service contract stops at the normalizer.

import type { DraughtsSide } from "@/features/casino/lib/draughts/engine";

export type DraughtsMatchState = "awaiting_opponent" | "in_progress" | "settled" | "cancelled";

// Only these two are implemented upstream. The service models five more and
// rejects them, so they are deliberately absent rather than offered and refused.
export type DraughtsVariant = "standard" | "from_position";

export interface DraughtsPlayer {
  id: string;
  username: string;
  walletAddress: string;
}

export type DraughtsResult =
  | { kind: "win"; winner: DraughtsSide; reason: DraughtsWinReason }
  | { kind: "draw"; reason: DraughtsDrawReason };

export type DraughtsWinReason = "no_moves" | "resignation" | "timeout" | "abandoned";
export type DraughtsDrawReason = "agreement" | "repetition" | "move_rule";

export interface DraughtsTakebackState {
  white: boolean;
  black: boolean;
  takebackable: boolean;
}

export interface DraughtsRematchState {
  offeredBy: string | null;
  nextMatchId: string | null;
}

export interface DraughtsWager {
  stakeUsdc: string;
  feeBps: number;
  status: string;
  winnerPlayer: string | null;
}

export interface DraughtsMatch {
  id: string;
  inviteCode: string;
  state: DraughtsMatchState;
  variant: DraughtsVariant;
  white: DraughtsPlayer | null;
  black: DraughtsPlayer | null;
  // Server-authoritative position. The client renders this and never decides
  // legality itself; the local engine only offers targets.
  fen: string;
  startingFen: string;
  turn: DraughtsSide;
  ply: number;
  // Full move history in the service's notation, oldest first.
  moves: string[];
  timeControl: string;
  // Seconds left on each clock at `clockUpdatedAt`, ticked locally in between.
  clocks: Record<DraughtsSide, number>;
  clockUpdatedAt: string;
  result: DraughtsResult | null;
  // The side with an outstanding draw offer, if any.
  drawOffered: DraughtsSide | null;
  takeback: DraughtsTakebackState;
  rematch: DraughtsRematchState;
  wager: DraughtsWager | null;
  // WS-gateway topic carrying this match's live frames.
  liveTopic: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// A waiting match presented as something to join.
export interface DraughtsChallenge {
  id: string;
  inviteCode: string;
  creator: DraughtsPlayer | null;
  timeControl: string;
  stakeUsdc: string | null;
  createdAt: string;
}

export type DraughtsChatRoom = "player" | "spectator";

export interface DraughtsChatMessage {
  id: number;
  matchId: string;
  room: DraughtsChatRoom;
  author: string;
  text: string;
  createdAt: string;
}

export interface DraughtsMatchNote {
  matchId: string;
  player: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
}

// A note pinned to one ply of the game, visible to both players.
export interface DraughtsMatchComment {
  id: string;
  matchId: string;
  ply: number;
  fen: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraughtsMatchInput {
  // "white", "black", or left to the service to pick.
  color?: "white" | "black" | "random";
  timeControl: string;
  stakeUsdc?: string | null;
  startingFen?: string | null;
}

export interface UpsertDraughtsCommentInput {
  ply: number;
  text: string;
}
