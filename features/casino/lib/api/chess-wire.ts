// Wire types for the chess service (GET /v1/chess) and the normalizer that
// maps them into our domain types. Components and hooks only ever see
// ChessMatch, so a change to the service contract stops here.
//
// The service owns game state plus the wager/rating snapshots attached to that
// game. Identity is a wallet address. Fields we have no source for are filled
// with honest neutral values, never invented data.

import { truncateAddress } from "@/lib/format";
import { formatTimeControl, parseTimeControl } from "@/features/casino/lib/time-control";
import type {
  ChessAnalysisMove,
  ChessAnalysisPlayerSummary,
  ChessChatMessage,
  ChessChatRoom,
  ChessChallenge,
  ChessClockMode,
  ChessComputerOpponent,
  ChessCoachProgress,
  ChessCoachProgressItem,
  ChessColor,
  ChessMatch,
  ChessMatchAnalysis,
  ChessMatchComment,
  ChessMatchRating,
  ChessMatchRatingSide,
  ChessMatchNote,
  ChessPerfKey,
  ChessRematchState,
  ChessMatchState,
  ChessPlayer,
  ChessResult,
  ChessWeaknessProfile,
  ChessInsightBucket,
  ChessTakebackState,
} from "@/features/casino/lib/api/types";

export type ChessStatusWire = "waiting" | "active" | "finished" | "aborted";
export type ChessSideWire = "white" | "black";
export type ChessResultWire = "white" | "black" | "draw";

export interface ChessClocksWire {
  whiteMs: number;
  blackMs: number;
}

export interface ChessTimeControlWire {
  mode?: ChessClockMode;
  initialSeconds: number;
  incrementSeconds: number;
}

export interface ChessComputerOpponentWire {
  player: string;
  name: string;
  side: ChessSideWire;
  level: number;
  coachEnabled?: boolean;
  hintsUsed?: number;
  wager?: ChessComputerWagerWire | null;
}

export interface ChessComputerWagerWire {
  stakeUsdc: string;
  houseExposureUsdc: string;
  potentialPayoutUsdc: string;
  drawPayoutUsdc?: string;
  feeBps: number;
  status: string;
  payoutUsdc: string;
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

export interface ChessMatchPlayerRatingWire {
  rating: number | null;
  provisional: boolean | null;
  diff: number | null;
}

export interface ChessMatchRatingWire {
  rated: boolean;
  perfKey?: ChessPerfKey | null;
  white: ChessMatchPlayerRatingWire;
  black: ChessMatchPlayerRatingWire;
}

export interface ChessTimeExtensionsWire {
  allowed: boolean;
  used: number;
  totalSeconds: number;
  maxUses: number;
  maxTotalSeconds: number;
}

export interface ChessMatchWire {
  id: string;
  videoEnabled?: boolean;
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
  timeExtensions?: ChessTimeExtensionsWire;
  // Shared backend timestamp at which these clock banks were current.
  // Optional while older service instances are still rolling out.
  clockUpdatedAt?: string;
  white: string | null;
  black: string | null;
  whiteCountryCode?: string | null;
  blackCountryCode?: string | null;
  whiteDisplayName?: string | null;
  blackDisplayName?: string | null;
  drawOfferBy: string | null;
  takeback?: ChessTakebackWire;
  rematch?: ChessRematchWire;
  rating?: ChessMatchRatingWire | null;
  computer?: ChessComputerOpponentWire | null;
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

export interface ChessAnalysisMoveWire {
  ply: number;
  player: string;
  side: "white" | "black";
  openingBucket: string;
  timeControl: string;
  phase: "opening" | "middlegame" | "endgame";
  motif:
    | "mate"
    | "doubleCheck"
    | "discoveredCheck"
    | "fork"
    | "pin"
    | "skewer"
    | "trappedPiece"
    | "removingDefender"
    | "exploitingPin"
    | "hangingPiece"
    | "doubledPawns"
    | "isolatedPawn"
    | "openFile"
    | "openingDeviation"
    | "endgameTechnique"
    | "materialLoss"
    | "tacticalMiss"
    | "positionalDrift";
  classification: "best" | "good" | "inaccuracy" | "mistake" | "blunder";
  fen: string;
  playedUci: string;
  playedSan: string;
  bestUci: string | null;
  bestSan: string | null;
  pv: string | null;
  cpBefore: number | null;
  cpAfter: number | null;
  cpLoss: number | null;
  mateBefore: number | null;
  mateAfter: number | null;
  accuracyPercent?: number | null;
  coachComment?: string;
  createdAt: string;
}

export interface ChessAnalysisPlayerSummaryWire {
  side: "white" | "black";
  accuracyPercent: number | null;
  averageCentipawnLoss: number | null;
  bestMoves: number;
  goodMoves: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

export interface ChessMatchAnalysisWire {
  matchId: string;
  analysed: boolean;
  status: "queued" | "running" | "completed" | "failed";
  requestOrigin: "manual" | "system";
  requestedBy: string | null;
  requestCount: number;
  depth: number;
  tier?: "standard" | "premium";
  engineName: string | null;
  failure: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  createdAt: string;
  summaries?: ChessAnalysisPlayerSummaryWire[];
  moves: ChessAnalysisMoveWire[];
}

export interface ChessInsightBucketWire {
  key: string;
  games: number;
  averageCpLoss: number;
  maxCpLoss: number;
  latestAt: string;
}

export interface ChessWeaknessProfileWire {
  player: string;
  generatedAt: string;
  totalMistakes: number;
  openings: ChessInsightBucketWire[];
  phases: ChessInsightBucketWire[];
  sides: ChessInsightBucketWire[];
  timeControls: ChessInsightBucketWire[];
  motifs: ChessInsightBucketWire[];
}

export interface ChessCoachProgressItemWire {
  lessonKey: string;
  chapterKey: string;
  bestScore: number;
  lastScore: number;
  attempts: number;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChessCoachProgressWire {
  player: string;
  totalEntries: number;
  completedEntries: number;
  items: ChessCoachProgressItemWire[];
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

const EMPTY_TIME_EXTENSIONS = {
  allowed: false,
  used: 0,
  totalSeconds: 0,
  maxUses: 3,
  maxTotalSeconds: 1_800,
} as const;

const EMPTY_MATCH_RATING_SIDE: ChessMatchRatingSide = {
  rating: null,
  provisional: null,
  diff: null,
};

const EMPTY_MATCH_RATING: ChessMatchRating = {
  rated: false,
  perfKey: null,
  white: EMPTY_MATCH_RATING_SIDE,
  black: EMPTY_MATCH_RATING_SIDE,
};

export function toColor(side: ChessSideWire): ChessColor {
  return side === "white" ? "w" : "b";
}

// Clock formatting is shared with draughts, which runs on the same service and
// the same base-plus-increment encoding. Re-exported so chess call sites keep
// importing it from here.
export { formatTimeControl, parseTimeControl };

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
function toMatchRatingSide(rating?: ChessMatchPlayerRatingWire | null): ChessMatchRatingSide {
  return rating
    ? {
        rating: rating.rating,
        provisional: rating.provisional,
        diff: rating.diff,
      }
    : EMPTY_MATCH_RATING_SIDE;
}

function toMatchRating(rating?: ChessMatchRatingWire | null): ChessMatchRating {
  if (!rating) return EMPTY_MATCH_RATING;
  return {
    rated: rating.rated,
    perfKey: rating.perfKey ?? null,
    white: toMatchRatingSide(rating.white),
    black: toMatchRatingSide(rating.black),
  };
}

export function toPlayer(
  wallet: string | null,
  rating?: ChessMatchPlayerRatingWire | null,
  countryCode?: string | null,
  displayName?: string | null
): ChessPlayer | null {
  if (!wallet) return null;
  const publicName = displayName?.trim();
  return {
    id: wallet,
    username: publicName || (EVM_WALLET.test(wallet) ? truncateAddress(wallet) : wallet),
    rating: rating?.rating ?? null,
    provisional: rating?.provisional ?? null,
    countryCode: countryCode ?? null,
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

function toComputerOpponent(
  computer?: ChessComputerOpponentWire | null
): ChessComputerOpponent | null {
  if (!computer) return null;
  return {
    player: computer.player,
    name: computer.name,
    side: computer.side,
    level: computer.level,
    coachEnabled: computer.coachEnabled ?? false,
    hintsUsed: computer.hintsUsed ?? 0,
    wager: computer.wager
      ? {
          stakeUsdc: computer.wager.stakeUsdc,
          houseExposureUsdc: computer.wager.houseExposureUsdc,
          potentialPayoutUsdc: computer.wager.potentialPayoutUsdc,
          drawPayoutUsdc: computer.wager.drawPayoutUsdc,
          feeBps: computer.wager.feeBps,
          status: computer.wager.status,
          payoutUsdc: computer.wager.payoutUsdc,
        }
      : null,
  };
}

function nameComputerSeat(
  player: ChessPlayer | null,
  side: ChessSideWire,
  computer?: ChessComputerOpponentWire | null
): ChessPlayer | null {
  if (!player || !computer || computer.side !== side) return player;
  return { ...player, username: computer.name, rating: null, provisional: null };
}

export function toChessMatch(wire: ChessMatchWire, options: ToChessMatchOptions = {}): ChessMatch {
  const moveWires = options.moves ?? [];
  const moves = options.moveSan ?? moveWires.map((m) => m.san);

  // When the clocks were last true. Prefer the backend's shared anchor so both
  // browsers count from the same instant. The move/start fallbacks support an
  // older backend during a rolling deploy.
  const clockUpdatedAt =
    wire.clockUpdatedAt ??
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
    videoEnabled: wire.videoEnabled ?? false,
    white: nameComputerSeat(
      toPlayer(wire.white, wire.rating?.white, wire.whiteCountryCode, wire.whiteDisplayName),
      "white",
      wire.computer
    ),
    black: nameComputerSeat(
      toPlayer(wire.black, wire.rating?.black, wire.blackCountryCode, wire.blackDisplayName),
      "black",
      wire.computer
    ),
    timeControl:
      wire.timeControl.mode === "unlimited"
        ? "Unlimited"
        : formatTimeControl(wire.timeControl.initialSeconds, wire.timeControl.incrementSeconds),
    clockMode: wire.timeControl.mode ?? "real_time",
    computer: toComputerOpponent(wire.computer),
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
    timeExtensions: wire.timeExtensions ?? EMPTY_TIME_EXTENSIONS,
    rating: toMatchRating(wire.rating),
    // A staked match carries its per-player USDC stake; null = played for free.
    stakeUsdc: wire.wager?.stakeUsdc ?? wire.computer?.wager?.stakeUsdc ?? null,
    wagerStatus: wire.wager?.status ?? wire.computer?.wager?.status ?? null,
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
  clockUpdatedAt?: string;
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
    clockUpdatedAt: frame.clockUpdatedAt ?? new Date().toISOString(),
    moves,
  };
}

const MATCH_STATE_ORDER: Record<ChessMatchState, number> = {
  awaiting_opponent: 0,
  in_progress: 1,
  settled: 2,
  cancelled: 2,
};

// A REST repair can finish after a newer socket frame. Never let that older
// response move a board backwards from active to waiting (or from finished to
// active). This is the client-side equivalent of Lichess's socket-version check
// before it accepts a reloaded round snapshot.
export function mergeChessMatchSnapshot(
  previous: ChessMatch | undefined,
  incoming: ChessMatch
): ChessMatch {
  if (!previous || previous.id !== incoming.id) return incoming;
  return MATCH_STATE_ORDER[incoming.state] < MATCH_STATE_ORDER[previous.state]
    ? previous
    : incoming;
}

// Fold a `state` frame (a full match snapshot: join, draw-offer changes, terminal
// transitions) into the cached match. It carries no move list, so the existing
// history is kept and the poll reconciles any gap.
export function applyStateFrame(prev: ChessMatch, wire: ChessMatchWire): ChessMatch {
  const next = toChessMatch(wire);
  const justStarted = prev.state === "awaiting_opponent" && next.state === "in_progress";
  return mergeChessMatchSnapshot(prev, {
    ...next,
    moves: prev.moves,
    // A rolling deployment can send a compact state packet without newer
    // capabilities. Absence means "unchanged", not "disabled".
    timeExtensions: wire.timeExtensions ? next.timeExtensions : prev.timeExtensions,
    // Joining is anchored to server startedAt. Later state-only frames retain
    // the last move anchor on old backends instead of using browser receipt time.
    clockUpdatedAt: wire.clockUpdatedAt || justStarted ? next.clockUpdatedAt : prev.clockUpdatedAt,
  });
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
  const creator = toPlayer(
    wire.white ?? wire.black,
    wire.white ? wire.rating?.white : wire.black ? wire.rating?.black : null
  );
  return {
    id: wire.id,
    videoEnabled: wire.videoEnabled ?? false,
    creator: creator ?? {
      id: wire.id,
      username: "Open seat",
      rating: null,
      provisional: null,
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

export function toChessAnalysisMove(wire: ChessAnalysisMoveWire): ChessAnalysisMove {
  return {
    ply: wire.ply,
    player: wire.player,
    side: wire.side,
    openingBucket: wire.openingBucket,
    timeControl: wire.timeControl,
    phase: wire.phase,
    motif: wire.motif,
    classification: wire.classification,
    fen: wire.fen,
    playedUci: wire.playedUci,
    playedSan: wire.playedSan,
    bestUci: wire.bestUci,
    bestSan: wire.bestSan,
    pv: wire.pv,
    cpBefore: wire.cpBefore,
    cpAfter: wire.cpAfter,
    cpLoss: wire.cpLoss,
    mateBefore: wire.mateBefore,
    mateAfter: wire.mateAfter,
    accuracyPercent: wire.accuracyPercent ?? null,
    coachComment: wire.coachComment ?? "",
    createdAt: wire.createdAt,
  };
}

function toChessAnalysisPlayerSummary(
  wire: ChessAnalysisPlayerSummaryWire
): ChessAnalysisPlayerSummary {
  return {
    side: wire.side,
    accuracyPercent: wire.accuracyPercent,
    averageCentipawnLoss: wire.averageCentipawnLoss,
    bestMoves: wire.bestMoves,
    goodMoves: wire.goodMoves,
    inaccuracies: wire.inaccuracies,
    mistakes: wire.mistakes,
    blunders: wire.blunders,
  };
}

export function toChessMatchAnalysis(wire: ChessMatchAnalysisWire): ChessMatchAnalysis {
  return {
    matchId: wire.matchId,
    analysed: wire.analysed,
    status: wire.status,
    requestOrigin: wire.requestOrigin,
    requestedBy: wire.requestedBy,
    requestCount: wire.requestCount,
    depth: wire.depth,
    tier: wire.tier ?? "standard",
    engineName: wire.engineName,
    failure: wire.failure,
    queuedAt: wire.queuedAt,
    startedAt: wire.startedAt,
    completedAt: wire.completedAt,
    updatedAt: wire.updatedAt,
    createdAt: wire.createdAt,
    summaries: (wire.summaries ?? []).map(toChessAnalysisPlayerSummary),
    moves: wire.moves.map(toChessAnalysisMove),
  };
}

export function toChessInsightBucket(wire: ChessInsightBucketWire): ChessInsightBucket {
  return {
    key: wire.key,
    games: wire.games,
    averageCpLoss: wire.averageCpLoss,
    maxCpLoss: wire.maxCpLoss,
    latestAt: wire.latestAt,
  };
}

export function toChessWeaknessProfile(wire: ChessWeaknessProfileWire): ChessWeaknessProfile {
  return {
    player: wire.player,
    generatedAt: wire.generatedAt,
    totalMistakes: wire.totalMistakes,
    openings: wire.openings.map(toChessInsightBucket),
    phases: wire.phases.map(toChessInsightBucket),
    sides: wire.sides.map(toChessInsightBucket),
    timeControls: wire.timeControls.map(toChessInsightBucket),
    motifs: wire.motifs.map(toChessInsightBucket),
  };
}

export function toChessCoachProgressItem(wire: ChessCoachProgressItemWire): ChessCoachProgressItem {
  return {
    lessonKey: wire.lessonKey,
    chapterKey: wire.chapterKey,
    bestScore: wire.bestScore,
    lastScore: wire.lastScore,
    attempts: wire.attempts,
    completed: wire.completed,
    completedAt: wire.completedAt,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

export function toChessCoachProgress(wire: ChessCoachProgressWire): ChessCoachProgress {
  return {
    player: wire.player,
    totalEntries: wire.totalEntries,
    completedEntries: wire.completedEntries,
    items: wire.items.map(toChessCoachProgressItem),
  };
}
