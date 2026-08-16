// Wire types for the draughts module of the chess service
// (/v1/chess/draughts) and the normalizer that maps them into our domain types.
// Components and hooks only ever see DraughtsMatch, so a change to the service
// contract stops here.
//
// Identity is a wallet address. Fields we have no source for are left neutral,
// never invented.

import { truncateAddress } from "@/lib/format";
import { formatTimeControl } from "@/features/casino/lib/time-control";
import {
  isDraughtsVariant,
  STARTING_FEN,
  type DraughtsSide,
} from "@/features/casino/lib/draughts/engine";
import type {
  DraughtsChallenge,
  DraughtsChatMessage,
  DraughtsChatRoom,
  DraughtsDrawReason,
  DraughtsMatch,
  DraughtsMatchComment,
  DraughtsMatchNote,
  DraughtsMatchRating,
  DraughtsMatchState,
  DraughtsPlayer,
  DraughtsRematchState,
  DraughtsResult,
  DraughtsTakebackState,
  DraughtsVariant,
  DraughtsWager,
  DraughtsWinReason,
} from "@/features/casino/lib/draughts/types";

export type DraughtsStatusWire = "waiting" | "active" | "finished" | "aborted";
export type DraughtsSideWire = "white" | "black";
export type DraughtsResultWire = "white" | "black" | "draw";

export interface DraughtsClocksWire {
  whiteMs: number;
  blackMs: number;
}

export interface DraughtsTimeControlWire {
  mode?: "real_time" | "unlimited";
  initialSeconds: number;
  incrementSeconds: number;
}

export interface DraughtsTimeExtensionsWire {
  allowed: boolean;
  used: number;
  totalSeconds: number;
  maxUses: number;
  maxTotalSeconds: number;
}

export interface DraughtsComputerWire {
  player: string;
  name: string;
  side: DraughtsSideWire;
  level: number;
  coachEnabled: boolean;
  hintsUsed: number;
  wager?: {
    stakeUsdc: string;
    houseExposureUsdc: string;
    potentialPayoutUsdc: string;
    feeBps: number;
    status: string;
    payoutUsdc: string;
  } | null;
}

export interface DraughtsWagerWire {
  stakeUsdc: string;
  feeBps: number;
  status: string;
  creatorPlayer?: string;
  opponentPlayer?: string | null;
  creatorLocked?: boolean;
  opponentLocked?: boolean;
  winnerPlayer?: string | null;
  settledAt?: string | null;
}

export interface DraughtsTakebackWire {
  white: boolean;
  black: boolean;
  takebackable: boolean;
}

export interface DraughtsRematchWire {
  offeredBy: string | null;
  nextMatchId: string | null;
}

export interface DraughtsPlayerRatingWire {
  rating: number | null;
  provisional: boolean | null;
  diff: number | null;
}

export interface DraughtsMatchRatingWire {
  rated: boolean;
  perfKey: DraughtsMatchRating["perfKey"];
  white: DraughtsPlayerRatingWire;
  black: DraughtsPlayerRatingWire;
}

export interface DraughtsMatchWire {
  id: string;
  inviteCode?: string;
  liveTopic?: string;
  variant: string;
  startingFen: string;
  white: string | null;
  black: string | null;
  status: DraughtsStatusWire;
  result: DraughtsResultWire | null;
  resultReason: string | null;
  winner?: string | null;
  loser?: string | null;
  fen: string;
  turn: DraughtsSideWire;
  ply: number;
  timeControl: DraughtsTimeControlWire;
  clocks: DraughtsClocksWire;
  timeExtensions?: DraughtsTimeExtensionsWire;
  clockUpdatedAt?: string;
  drawOfferBy: string | null;
  takeback?: DraughtsTakebackWire;
  rematch?: DraughtsRematchWire;
  wager?: DraughtsWagerWire | null;
  computer?: DraughtsComputerWire | null;
  // Older deployed matches predate ratings. Keep this optional at the wire
  // boundary so reopening one cannot crash the play screen.
  rating?: DraughtsMatchRatingWire;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DraughtsMoveWire {
  ply: number;
  uci: string;
  san: string;
  fenAfter: string;
  byPlayer: string;
  clockMsRemaining: number | null;
  createdAt: string;
}

export interface DraughtsChatMessageWire {
  id: number;
  matchId: string;
  room: DraughtsChatRoom;
  author: string;
  text: string;
  createdAt: string;
}

export interface DraughtsMatchNoteWire {
  matchId: string;
  player: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DraughtsMatchCommentWire {
  id: string;
  matchId: string;
  ply: number;
  fen: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

// Match ids are UUIDs. A malformed id makes the gateway answer with plain text
// instead of the usual envelope, so callers check the shape before spending a
// request on it.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isMatchId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

const STATE_BY_STATUS: Record<DraughtsStatusWire, DraughtsMatchState> = {
  waiting: "awaiting_opponent",
  active: "in_progress",
  finished: "settled",
  aborted: "cancelled",
};

const EMPTY_TAKEBACK: DraughtsTakebackState = {
  white: false,
  black: false,
  takebackable: false,
};

const EMPTY_REMATCH: DraughtsRematchState = {
  offeredBy: null,
  nextMatchId: null,
};

const UNRATED_MATCH: DraughtsMatchRating = {
  rated: false,
  perfKey: null,
  white: { rating: null, provisional: null, diff: null },
  black: { rating: null, provisional: null, diff: null },
};

export function toVariant(value: string): DraughtsVariant {
  return isDraughtsVariant(value) ? value : "standard";
}

// The service reports the winning side and a reason separately, while our
// result type pairs them. Reasons are matched loosely: the exact wording is the
// service's to change, and an unknown reason should still produce a usable
// result rather than discarding a finished game.
function drawReason(reason: string | null): DraughtsDrawReason {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("repet") || r.includes("threefold")) return "repetition";
  if (r.includes("move_rule") || r.includes("twenty_five")) return "move_rule";
  return "agreement";
}

function winReason(reason: string | null): DraughtsWinReason {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("resign")) return "resignation";
  if (r.includes("time") || r.includes("outoftime")) return "timeout";
  if (r.includes("abort") || r.includes("no_start")) return "abandoned";
  // "mate" upstream means the side to move has no legal move left, which in
  // draughts is a block or a wipeout rather than a checkmate.
  return "no_moves";
}

export function toResult(
  result: DraughtsResultWire | null,
  resultReason: string | null
): DraughtsResult | null {
  if (!result) return null;
  if (result === "draw") return { kind: "draw", reason: drawReason(resultReason) };
  return { kind: "win", winner: result, reason: winReason(resultReason) };
}

// A seat holds a wallet address and nothing else. The address doubles as the
// display name until the service has profiles.
export function toPlayer(wallet: string | null): DraughtsPlayer | null {
  if (!wallet) return null;
  return {
    id: wallet,
    username: EVM_WALLET.test(wallet) ? truncateAddress(wallet) : wallet,
    walletAddress: wallet,
  };
}

function toWager(wire: DraughtsWagerWire | null | undefined): DraughtsWager | null {
  if (!wire) return null;
  return {
    stakeUsdc: wire.stakeUsdc,
    feeBps: wire.feeBps,
    status: wire.status,
    winnerPlayer: wire.winnerPlayer ?? null,
  };
}

// A match that has just started can arrive with both clocks at zero before the
// service has stamped them. Showing 0:00 would read as a flagged game, so the
// opening snapshot falls back to the agreed starting bank.
function normalizeClocks(wire: DraughtsMatchWire): Record<DraughtsSide, number> {
  const openingSnapshotMissingClocks =
    wire.status === "active" &&
    wire.ply === 0 &&
    wire.result === null &&
    wire.clocks.whiteMs === 0 &&
    wire.clocks.blackMs === 0;

  if (openingSnapshotMissingClocks) {
    return {
      white: wire.timeControl.initialSeconds,
      black: wire.timeControl.initialSeconds,
    };
  }
  return { white: wire.clocks.whiteMs / 1000, black: wire.clocks.blackMs / 1000 };
}

export interface ToDraughtsMatchOptions {
  moves?: DraughtsMoveWire[];
  moveSan?: string[];
  clockUpdatedAt?: string;
}

export function toDraughtsMatch(
  wire: DraughtsMatchWire,
  options: ToDraughtsMatchOptions = {}
): DraughtsMatch {
  const moveWires = options.moves ?? [];
  const moves = options.moveSan ?? moveWires.map((m) => m.san);

  // New servers provide the exact instant these clocks were true. The move and
  // start timestamps remain fallbacks for old snapshots.
  const clockUpdatedAt =
    options.clockUpdatedAt ??
    wire.clockUpdatedAt ??
    (moveWires.length > 0
      ? moveWires[moveWires.length - 1].createdAt
      : (wire.startedAt ?? wire.createdAt));

  const drawOffered: DraughtsSide | null =
    wire.drawOfferBy === null
      ? null
      : wire.drawOfferBy === wire.white
        ? "white"
        : wire.drawOfferBy === wire.black
          ? "black"
          : null;

  return {
    id: wire.id,
    inviteCode: wire.inviteCode ?? wire.id,
    state: STATE_BY_STATUS[wire.status],
    variant: toVariant(wire.variant),
    white: toPlayer(wire.white),
    black: toPlayer(wire.black),
    fen: wire.fen,
    startingFen: wire.startingFen || STARTING_FEN,
    turn: wire.turn,
    ply: wire.ply,
    moves,
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    clockMode: wire.timeControl.mode ?? "real_time",
    clocks: normalizeClocks(wire),
    clockUpdatedAt,
    result: toResult(wire.result, wire.resultReason),
    drawOffered,
    takeback: { ...EMPTY_TAKEBACK, ...(wire.takeback ?? {}) },
    rematch: { ...EMPTY_REMATCH, ...(wire.rematch ?? {}) },
    timeExtensions: {
      allowed: false,
      used: 0,
      totalSeconds: 0,
      maxUses: 0,
      maxTotalSeconds: 0,
      ...(wire.timeExtensions ?? {}),
    },
    wager: toWager(wire.wager),
    computer: wire.computer
      ? {
          player: wire.computer.player,
          name: wire.computer.name,
          side: wire.computer.side,
          level: wire.computer.level,
          coachEnabled: wire.computer.coachEnabled,
          hintsUsed: wire.computer.hintsUsed,
          wager: wire.computer.wager
            ? {
                stakeUsdc: wire.computer.wager.stakeUsdc,
                houseExposureUsdc: wire.computer.wager.houseExposureUsdc,
                potentialPayoutUsdc: wire.computer.wager.potentialPayoutUsdc,
                feeBps: wire.computer.wager.feeBps,
                status: wire.computer.wager.status,
                payoutUsdc: wire.computer.wager.payoutUsdc,
              }
            : null,
        }
      : null,
    rating: wire.rating ?? UNRATED_MATCH,
    // Take the topic from the response; the fallback only covers an older
    // service that predates the field.
    liveTopic: wire.liveTopic ?? `draughts:match:${wire.id}`,
    createdAt: wire.createdAt,
    startedAt: wire.startedAt,
    finishedAt: wire.finishedAt,
  };
}

export function toDraughtsChallenge(wire: DraughtsMatchWire): DraughtsChallenge {
  return {
    id: wire.id,
    inviteCode: wire.inviteCode ?? wire.id,
    creator: toPlayer(wire.white ?? wire.black),
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    stakeUsdc: wire.wager?.stakeUsdc ?? null,
    createdAt: wire.createdAt,
  };
}

export function toDraughtsMatchNote(wire: DraughtsMatchNoteWire): DraughtsMatchNote {
  return {
    matchId: wire.matchId,
    player: wire.player,
    text: wire.text,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

export function toDraughtsMatchComment(wire: DraughtsMatchCommentWire): DraughtsMatchComment {
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

export function toDraughtsChatMessage(wire: DraughtsChatMessageWire): DraughtsChatMessage {
  return {
    id: wire.id,
    matchId: wire.matchId,
    room: wire.room,
    author: wire.author,
    text: wire.text,
    createdAt: wire.createdAt,
  };
}

// Live frames pushed by the WS gateway on draughts:match:<id>. Applying them in
// place is what makes an opponent's move realtime: the board is driven by the
// frame, never by a follow-up refetch.

export interface DraughtsPositionFrame {
  fen: string;
  turn: DraughtsSideWire;
  ply: number;
  lastMove?: { uci: string; san: string } | null;
  clocks?: DraughtsClocksWire;
  clockUpdatedAt?: string;
  status?: DraughtsStatusWire;
}

// Fold a `position` frame into the cached match. The board always takes the
// frame's server-authoritative values immediately. The move history only gains
// the move when the frame is exactly the next ply; a repeat or a gap leaves the
// list for the reconciliation poll to repair, so the move panel can never
// silently desync from the board.
export function applyPositionFrame(
  prev: DraughtsMatch,
  frame: DraughtsPositionFrame
): DraughtsMatch {
  const san = frame.lastMove?.san;
  const moves = san && frame.ply === prev.moves.length + 1 ? [...prev.moves, san] : prev.moves;
  return {
    ...prev,
    fen: frame.fen,
    turn: frame.turn,
    ply: frame.ply,
    state: frame.status ? STATE_BY_STATUS[frame.status] : prev.state,
    clocks: frame.clocks
      ? { white: frame.clocks.whiteMs / 1000, black: frame.clocks.blackMs / 1000 }
      : prev.clocks,
    // The frame reflects the clocks as of now, so now is the honest reference
    // the local tick counts down from.
    clockUpdatedAt:
      frame.clockUpdatedAt && Number.isFinite(Date.parse(frame.clockUpdatedAt))
        ? frame.clockUpdatedAt
        : new Date().toISOString(),
    moves,
  };
}

export interface DraughtsTakebackOffersFrame {
  white: number | boolean | null;
  black: number | boolean | null;
}

export function applyTakebackOffersFrame(
  prev: DraughtsMatch,
  frame: DraughtsTakebackOffersFrame
): DraughtsMatch {
  return {
    ...prev,
    takeback: {
      ...prev.takeback,
      // The service sends the ply an offer was made at, so anything non-null
      // means an offer stands.
      white: frame.white !== null && frame.white !== false,
      black: frame.black !== null && frame.black !== false,
    },
  };
}

export interface DraughtsRematchOfferFrame {
  offeredBy: string | null;
}

export function applyRematchOfferFrame(
  prev: DraughtsMatch,
  frame: DraughtsRematchOfferFrame
): DraughtsMatch {
  return { ...prev, rematch: { ...prev.rematch, offeredBy: frame.offeredBy ?? null } };
}

export interface DraughtsRematchTakenFrame {
  nextMatchId: string;
}

export function applyRematchTakenFrame(
  prev: DraughtsMatch,
  frame: DraughtsRematchTakenFrame
): DraughtsMatch {
  return { ...prev, rematch: { ...prev.rematch, nextMatchId: frame.nextMatchId } };
}

export function applyChatLineFrame(
  prev: DraughtsChatMessage[],
  frame: DraughtsChatMessageWire
): DraughtsChatMessage[] {
  const next = toDraughtsChatMessage(frame);
  if (prev.some((line) => line.id === next.id)) return prev;
  return [...prev, next].sort((left, right) => left.id - right.id);
}

export function applyCommentUpsertedFrame(
  prev: DraughtsMatchComment[],
  frame: DraughtsMatchCommentWire
): DraughtsMatchComment[] {
  const next = toDraughtsMatchComment(frame);
  const others = prev.filter((comment) => comment.id !== next.id);
  return [...others, next].sort((left, right) => {
    if (left.ply !== right.ply) return left.ply - right.ply;
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });
}

export interface DraughtsCommentDeletedFrame {
  id: string;
  matchId: string;
  ply: number;
}

export function applyCommentDeletedFrame(
  prev: DraughtsMatchComment[],
  frame: DraughtsCommentDeletedFrame
): DraughtsMatchComment[] {
  return prev.filter((comment) => comment.id !== frame.id);
}
