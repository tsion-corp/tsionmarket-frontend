// Wire types for the chess service (GET /v1/chess) and the normalizer that
// maps them into our domain types. Components and hooks only ever see
// ChessMatch, so a change to the service contract stops here.
//
// The service models a game and nothing else: no stakes, no ratings, no
// spectator counts. Identity is a wallet address. Fields we have no source for
// are filled with honest neutral values, never invented data.

import { truncateAddress } from "@/lib/format";
import type {
  ChessChallenge,
  ChessColor,
  ChessMatch,
  ChessMatchState,
  ChessPlayer,
  ChessResult,
} from "@/lib/casino/api/types";

export type ChessStatusWire = "waiting" | "active" | "finished" | "aborted";
export type ChessSideWire = "white" | "black";
export type ChessResultWire = "white" | "black" | "draw";

export interface ChessClocksWire {
  whiteMs: number;
  blackMs: number;
}

export interface ChessTimeControlWire {
  initialSeconds: number;
  incrementSeconds: number;
}

// A wager attached to a staked match. Stakes lock at create/join, draws and
// aborts refund, decisive results settle to the winner minus the platform fee.
export interface ChessWagerWire {
  stakeUsdc: string;
  feeBps: number;
  status: string;
  winnerPlayer?: string | null;
}

export interface ChessMatchWire {
  id: string;
  // The service currently sets this to the match id; carried so a future
  // short-code scheme works without a client change.
  inviteCode?: string;
  // WS-gateway topic for live frames, once the backend's relay publishes.
  liveTopic?: string;
  status: ChessStatusWire;
  fen: string;
  turn: ChessSideWire;
  ply: number;
  timeControl: ChessTimeControlWire;
  clocks: ChessClocksWire;
  white: string | null;
  black: string | null;
  drawOfferBy: string | null;
  result: ChessResultWire | null;
  resultReason: string | null;
  wager?: ChessWagerWire | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ChessMoveWire {
  ply: number;
  uci: string;
  san: string;
  fenAfter: string;
  byPlayer: string;
  clockMsRemaining: number | null;
  createdAt: string;
}

// Match ids are UUIDs. A malformed id makes the gateway answer with plain text
// instead of the usual envelope, which surfaces as a confusing transport error,
// so callers check the shape before spending a request on it.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMatchId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

const STATE_BY_STATUS: Record<ChessStatusWire, ChessMatchState> = {
  waiting: "awaiting_opponent",
  active: "in_progress",
  finished: "settled",
  aborted: "cancelled",
};

export function toColor(side: ChessSideWire): ChessColor {
  return side === "white" ? "w" : "b";
}

// "3+2" from 180 seconds and a 2 second increment. Controls that are not a
// whole number of minutes keep their seconds, so an unusual one from the
// service still reads correctly instead of rounding to a wrong label.
export function formatTimeControl(initialSeconds: number, incrementSeconds: number): string {
  const minutes = initialSeconds / 60;
  const main = Number.isInteger(minutes) ? `${minutes}` : `${initialSeconds}s`;
  return `${main}+${incrementSeconds}`;
}

// Inverse of formatTimeControl, for turning a chip like "5+3" back into the
// seconds the create endpoint wants.
export function parseTimeControl(label: string): ChessTimeControlWire {
  const [main = "", increment = "0"] = label.split("+");
  const initialSeconds = main.endsWith("s") ? Number(main.slice(0, -1)) : Number(main) * 60;
  const incrementSeconds = Number(increment);
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) {
    throw new Error(`Unrecognised time control: ${label}`);
  }
  return { initialSeconds, incrementSeconds };
}

// The service reports a winner and a free-text reason separately, while our
// result type pairs them. The reason is matched loosely because the exact
// wording is the service's to change, and an unknown reason should still
// produce a usable result rather than throwing away a finished game.
function drawReason(reason: string | null): Extract<ChessResult, { kind: "draw" }>["reason"] {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("stale")) return "stalemate";
  if (r.includes("repet") || r.includes("threefold")) return "repetition";
  if (r.includes("insufficient") || r.includes("material")) return "insufficient";
  return "agreement";
}

function decisiveKind(reason: string | null): "checkmate" | "resignation" | "timeout" {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("resign")) return "resignation";
  if (r.includes("time") || r.includes("flag")) return "timeout";
  return "checkmate";
}

export function toResult(
  result: ChessResultWire | null,
  resultReason: string | null
): ChessResult | null {
  if (!result) return null;
  if (result === "draw") return { kind: "draw", reason: drawReason(resultReason) };
  return { kind: decisiveKind(resultReason), winner: toColor(result) };
}

// A seat holds a wallet address and nothing else. The address doubles as the
// display name until the service has profiles.
export function toPlayer(wallet: string | null): ChessPlayer | null {
  if (!wallet) return null;
  return {
    id: wallet,
    username: truncateAddress(wallet),
    rating: 0,
    walletAddress: wallet,
  };
}

export interface ToChessMatchOptions {
  moves?: ChessMoveWire[];
}

export function toChessMatch(wire: ChessMatchWire, options: ToChessMatchOptions = {}): ChessMatch {
  const moves = options.moves ?? [];

  // When the clocks were last true. The service has no "as of" field and does
  // not charge time on a read, so the last move is the only honest reference
  // point; using the moment the response arrived would restart the countdown on
  // every poll and freeze the displayed clock.
  const clockUpdatedAt =
    moves.length > 0 ? moves[moves.length - 1].createdAt : (wire.startedAt ?? wire.createdAt);

  const drawOfferSide: ChessColor | null =
    wire.drawOfferBy === null
      ? null
      : wire.drawOfferBy === wire.white
        ? "w"
        : wire.drawOfferBy === wire.black
          ? "b"
          : null;

  return {
    id: wire.id,
    state: STATE_BY_STATUS[wire.status],
    white: toPlayer(wire.white),
    black: toPlayer(wire.black),
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    fen: wire.fen,
    moves: moves.map((m) => m.san),
    clocks: { w: wire.clocks.whiteMs / 1000, b: wire.clocks.blackMs / 1000 },
    clockUpdatedAt,
    turn: toColor(wire.turn),
    result: toResult(wire.result, wire.resultReason),
    drawOffered: drawOfferSide,
    // A staked match carries its per-player USDC stake; null = played for free.
    stakeUsdc: wire.wager?.stakeUsdc ?? null,
    wagerStatus: wire.wager?.status ?? null,
    // The doc says to take the topic from the response, never recompute it;
    // the fallback only covers an older service that predates the field.
    liveTopic: wire.liveTopic ?? `chess:match:${wire.id}`,
    createdAt: wire.createdAt,
  };
}

// A waiting match, presented as a joinable challenge. The creator is whichever
// seat is already taken, and the match id is what an invite link carries.
export function toChessChallenge(wire: ChessMatchWire): ChessChallenge {
  const creator = toPlayer(wire.white ?? wire.black);
  return {
    id: wire.id,
    creator: creator ?? {
      id: wire.id,
      username: "Open seat",
      rating: 0,
      walletAddress: "",
    },
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    createdAt: wire.createdAt,
    // The service's invite code is the match id today; prefer its own field so
    // a future short-code scheme needs no client change.
    inviteCode: wire.inviteCode ?? wire.id,
    stakeUsdc: wire.wager?.stakeUsdc ?? null,
  };
}
