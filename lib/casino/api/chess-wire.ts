// Wire types for the chess service (GET /v1/chess) and the normalizer that
// maps them into our domain types. Components and hooks only ever see
// ChessMatch, so a change to the service contract stops here.
//
// The service models a game and nothing else: no stakes, no ratings, no
// spectator counts. Identity is a wallet address. Fields we have no source for
// are filled with honest neutral values, never invented data.

import { truncateAddress } from "@/lib/format";
import type {
  ChessChatMessage,
  ChessChatRoom,
  ChessChallenge,
  ChessColor,
  ChessMatch,
  ChessMatchComment,
  ChessMatchNote,
  ChessRematchState,
  ChessMatchState,
  ChessPlayer,
  ChessResult,
  ChessTakebackState,
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

export interface ChessTakebackWire {
  white: boolean;
  black: boolean;
  takebackable: boolean;
}

export interface ChessRematchWire {
  offeredBy: string | null;
  nextMatchId: string | null;
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
  takeback?: ChessTakebackWire;
  rematch?: ChessRematchWire;
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

export interface ChessChatMessageWire {
  id: number;
  matchId: string;
  room: ChessChatRoom;
  author: string;
  text: string;
  createdAt: string;
}

export interface ChessChatMessagesWire {
  items: ChessChatMessageWire[];
}

export interface ChessMatchNoteWire {
  matchId: string;
  player: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChessMatchCommentWire {
  id: string;
  matchId: string;
  ply: number;
  fen: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChessMatchCommentsWire {
  items: ChessMatchCommentWire[];
}

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/;

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

const EMPTY_TAKEBACK: ChessTakebackState = {
  white: false,
  black: false,
  takebackable: false,
};

const EMPTY_REMATCH: ChessRematchState = {
  offeredBy: null,
  nextMatchId: null,
};

export function toColor(side: ChessSideWire): ChessColor {
  return side === "white" ? "w" : "b";
}

// A per-move budget of `seconds` shown as a single chip: "30s", or "2m" for a
// whole number of minutes. The seconds form is kept below a minute so a 45s
// budget doesn't render as "0.75m".
function formatPerMove(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

// The seconds behind a per-move chip: "30s" -> 30, "2m" -> 120, bare "90" -> 90.
function parsePerMove(label: string): number {
  const trimmed = label.trim();
  const unit = trimmed.slice(-1);
  const value = Number(unit === "s" || unit === "m" ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(value)) throw new Error(`Unrecognised time control: ${label}`);
  return unit === "m" ? value * 60 : value;
}

// The chosen label a match's clocks read back as. Our own games use the per-move
// model, where the service holds an equal base and Fischer increment, so an
// `initialSeconds === incrementSeconds` pair is shown as one per-move budget.
// A match made elsewhere with a distinct base and increment (standard chess)
// still reads correctly as "5+3" rather than being forced into the per-move form.
export function formatTimeControl(initialSeconds: number, incrementSeconds: number): string {
  if (initialSeconds === incrementSeconds) return formatPerMove(initialSeconds);
  const minutes = initialSeconds / 60;
  const main = Number.isInteger(minutes) ? `${minutes}` : `${initialSeconds}s`;
  return `${main}+${incrementSeconds}`;
}

// Turn a chip back into the seconds the create endpoint wants. A per-move chip
// ("30s", "2m") maps to an equal base and increment: every move restores that
// budget, so the player always has about that long to move. A legacy "5+3" chip
// still parses into a distinct base and increment.
export function parseTimeControl(label: string): ChessTimeControlWire {
  if (label.includes("+")) {
    const [main = "", increment = "0"] = label.split("+");
    const initialSeconds = main.endsWith("s") ? Number(main.slice(0, -1)) : Number(main) * 60;
    const incrementSeconds = Number(increment);
    if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) {
      throw new Error(`Unrecognised time control: ${label}`);
    }
    return { initialSeconds, incrementSeconds };
  }
  const perMove = parsePerMove(label);
  return { initialSeconds: perMove, incrementSeconds: perMove };
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
    username: EVM_WALLET.test(wallet) ? truncateAddress(wallet) : wallet,
    // No rating source yet, so leave it unknown rather than inventing a zero.
    rating: null,
    walletAddress: wallet,
  };
}

export interface ToChessMatchOptions {
  moves?: ChessMoveWire[];
  moveSan?: string[];
  clockUpdatedAt?: string;
}

function normalizeClocks(wire: ChessMatchWire): Record<ChessColor, number> {
  const openingSnapshotMissingClocks =
    wire.status === "active" &&
    wire.ply === 0 &&
    wire.result === null &&
    wire.clocks.whiteMs === 0 &&
    wire.clocks.blackMs === 0;

  if (openingSnapshotMissingClocks) {
    return {
      w: wire.timeControl.initialSeconds,
      b: wire.timeControl.initialSeconds,
    };
  }

  return {
    w: wire.clocks.whiteMs / 1000,
    b: wire.clocks.blackMs / 1000,
  };
}

export function toChessMatch(wire: ChessMatchWire, options: ToChessMatchOptions = {}): ChessMatch {
  const moveWires = options.moves ?? [];
  const moves = options.moveSan ?? moveWires.map((m) => m.san);

  // When the clocks were last true. The service has no "as of" field and does
  // not charge time on a read, so the last move is the only honest reference
  // point; using the moment the response arrived would restart the countdown on
  // every poll and freeze the displayed clock.
  const clockUpdatedAt =
    options.clockUpdatedAt ??
    (moveWires.length > 0
      ? moveWires[moveWires.length - 1].createdAt
      : (wire.startedAt ?? wire.createdAt));

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
    moves,
    clocks: normalizeClocks(wire),
    clockUpdatedAt,
    turn: toColor(wire.turn),
    result: toResult(wire.result, wire.resultReason),
    drawOffered: drawOfferSide,
    takeback: {
      ...EMPTY_TAKEBACK,
      ...(wire.takeback ?? {}),
    },
    rematch: {
      ...EMPTY_REMATCH,
      ...(wire.rematch ?? {}),
    },
    // A staked match carries its per-player USDC stake; null = played for free.
    stakeUsdc: wire.wager?.stakeUsdc ?? null,
    wagerStatus: wire.wager?.status ?? null,
    // The doc says to take the topic from the response, never recompute it;
    // the fallback only covers an older service that predates the field.
    liveTopic: wire.liveTopic ?? `chess:match:${wire.id}`,
    createdAt: wire.createdAt,
  };
}

export function toChessChatMessage(wire: ChessChatMessageWire): ChessChatMessage {
  return {
    id: wire.id,
    matchId: wire.matchId,
    room: wire.room,
    author: wire.author,
    text: wire.text,
    createdAt: wire.createdAt,
  };
}

export function toChessMatchNote(wire: ChessMatchNoteWire): ChessMatchNote {
  return {
    matchId: wire.matchId,
    player: wire.player,
    text: wire.text,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

export function toChessMatchComment(wire: ChessMatchCommentWire): ChessMatchComment {
  return {
    id: wire.id,
    matchId: wire.matchId,
    ply: wire.ply,
    fen: wire.fen,
    author: wire.author,
    text: wire.text,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

// Live frames pushed by the WS gateway on chess:match:<id>. The gateway wraps
// every frame in { type, data, timestamp }; these are the chess payloads inside
// `data`. Applying them in place is what makes an opponent's move realtime — the
// board is driven by the frame, never by a follow-up refetch.

// A `position` frame: emitted the instant a move is applied server-side.
export interface ChessPositionFrame {
  fen: string;
  turn: ChessSideWire;
  ply: number;
  lastMove?: { uci: string; san: string } | null;
  clocks: ChessClocksWire;
  status: ChessStatusWire;
}

// Fold a `position` frame into the cached match. The board (fen/turn/clocks)
// always takes the frame's server-authoritative values immediately. The SAN
// history only gains the move when the frame is exactly the next ply; a repeat
// or a gap (a frame we missed) leaves the list for the reconciliation poll to
// repair, so the move panel can never silently desync from the board.
export function applyPositionFrame(prev: ChessMatch, frame: ChessPositionFrame): ChessMatch {
  const san = frame.lastMove?.san;
  const moves = san && frame.ply === prev.moves.length + 1 ? [...prev.moves, san] : prev.moves;
  return {
    ...prev,
    fen: frame.fen,
    turn: toColor(frame.turn),
    state: STATE_BY_STATUS[frame.status],
    clocks: { w: frame.clocks.whiteMs / 1000, b: frame.clocks.blackMs / 1000 },
    // The frame reflects the clocks as of now, so now is the honest reference the
    // local tick counts down from.
    clockUpdatedAt: new Date().toISOString(),
    moves,
  };
}

// Fold a `state` frame (a full match snapshot: join, draw-offer changes, terminal
// transitions) into the cached match. It carries no move list, so the existing
// history is kept and the poll reconciles any gap.
export function applyStateFrame(prev: ChessMatch, wire: ChessMatchWire): ChessMatch {
  const next = toChessMatch(wire);
  return { ...next, moves: prev.moves, clockUpdatedAt: new Date().toISOString() };
}

export interface ChessTakebackOffersFrame {
  white: boolean;
  black: boolean;
}

export interface ChessRematchOfferFrame {
  offeredBy: string | null;
}

export interface ChessRematchTakenFrame {
  nextMatchId: string;
}

export interface ChessCommentDeletedFrame {
  id: string;
  matchId: string;
  ply: number;
  author: string;
}

export function applyTakebackOffersFrame(
  prev: ChessMatch,
  frame: ChessTakebackOffersFrame
): ChessMatch {
  return {
    ...prev,
    takeback: {
      ...prev.takeback,
      white: frame.white,
      black: frame.black,
    },
  };
}

export function applyRematchOfferFrame(
  prev: ChessMatch,
  frame: ChessRematchOfferFrame
): ChessMatch {
  return {
    ...prev,
    rematch: {
      ...prev.rematch,
      offeredBy: frame.offeredBy ?? null,
    },
  };
}

export function applyRematchTakenFrame(
  prev: ChessMatch,
  frame: ChessRematchTakenFrame
): ChessMatch {
  return {
    ...prev,
    rematch: {
      ...prev.rematch,
      nextMatchId: frame.nextMatchId,
    },
  };
}

export function applyChatLineFrame(
  prev: ChessChatMessage[],
  frame: ChessChatMessageWire
): ChessChatMessage[] {
  const next = toChessChatMessage(frame);
  if (prev.some((line) => line.id === next.id)) return prev;
  return [...prev, next].sort((left, right) => left.id - right.id);
}

export function applyCommentUpsertedFrame(
  prev: ChessMatchComment[],
  frame: ChessMatchCommentWire
): ChessMatchComment[] {
  const next = toChessMatchComment(frame);
  const withoutCurrent = prev.filter((comment) => comment.id !== next.id);
  return [...withoutCurrent, next].sort((left, right) => {
    if (left.ply !== right.ply) return left.ply - right.ply;
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });
}

export function applyCommentDeletedFrame(
  prev: ChessMatchComment[],
  frame: ChessCommentDeletedFrame
): ChessMatchComment[] {
  return prev.filter((comment) => comment.id !== frame.id);
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
      rating: null,
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
