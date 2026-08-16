// Domain types for draughts. Pure data: nothing here imports the framework,
// the transport, or the service's wire shapes. Components and hooks only ever
// see these, so a change to the service contract stops at the normalizer.

import type { DraughtsSide, DraughtsVariant } from "@/features/casino/lib/draughts/engine";

export type { DraughtsVariant } from "@/features/casino/lib/draughts/engine";

export type DraughtsMatchState = "awaiting_opponent" | "in_progress" | "settled" | "cancelled";

export type DraughtsClockMode = "real_time" | "unlimited";

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

export interface DraughtsComputerWager {
  stakeUsdc: string;
  houseExposureUsdc: string;
  potentialPayoutUsdc: string;
  feeBps: number;
  status: string;
  payoutUsdc: string;
}

export interface DraughtsComputerOpponent {
  player: string;
  name: string;
  side: DraughtsSide;
  level: number;
  coachEnabled: boolean;
  hintsUsed: number;
  wager: DraughtsComputerWager | null;
}

export interface DraughtsTimeExtensionState {
  allowed: boolean;
  used: number;
  totalSeconds: number;
  maxUses: number;
  maxTotalSeconds: number;
}

export type DraughtsPerfKey =
  | "ultraBullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "standard"
  | "frisian"
  | "frysk"
  | "antidraughts"
  | "breakthrough"
  | "russian"
  | "brazilian";

export interface DraughtsPlayerRating {
  rating: number | null;
  provisional: boolean | null;
  diff: number | null;
}

export interface DraughtsMatchRating {
  rated: boolean;
  perfKey: DraughtsPerfKey | null;
  white: DraughtsPlayerRating;
  black: DraughtsPlayerRating;
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
  clockMode: DraughtsClockMode;
  // Seconds left on each clock at `clockUpdatedAt`, ticked locally in between.
  clocks: Record<DraughtsSide, number>;
  clockUpdatedAt: string;
  result: DraughtsResult | null;
  // The side with an outstanding draw offer, if any.
  drawOffered: DraughtsSide | null;
  takeback: DraughtsTakebackState;
  rematch: DraughtsRematchState;
  timeExtensions: DraughtsTimeExtensionState;
  wager: DraughtsWager | null;
  computer: DraughtsComputerOpponent | null;
  rating: DraughtsMatchRating;
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
  variant?: DraughtsVariant;
  clockMode?: DraughtsClockMode;
  allowTimeExtensions?: boolean;
  stakeUsdc?: string | null;
  startingFen?: string | null;
}

export interface CreateDraughtsComputerMatchInput {
  level: number;
  color: "white" | "black" | "random";
  variant: Exclude<DraughtsVariant, "from_position"> | "from_position";
  startingFen?: string | null;
  timeMode: DraughtsClockMode;
  initialSeconds?: number;
  incrementSeconds?: number;
  stakeUsdc?: string | null;
  coachEnabled?: boolean;
}

export interface UpsertDraughtsCommentInput {
  ply: number;
  text: string;
}

export interface DraughtsComputerHint {
  id: string;
  matchId: string;
  ply: number;
  suggestedUci: string;
  createdAt: string;
}

export type DraughtsAnalysisStatus = "queued" | "running" | "complete" | "failed";
export type DraughtsAnalysisClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface DraughtsAnalysisPosition {
  ply: number;
  player: string | null;
  side: DraughtsSide;
  phase: string;
  variant: DraughtsVariant;
  timeControl: string;
  fen: string;
  playedUci: string | null;
  bestUci: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  loss: number | null;
  classification: DraughtsAnalysisClassification;
  motif: string;
  principalVariation: string | null;
}

export interface DraughtsMatchAnalysis {
  matchId: string;
  status: DraughtsAnalysisStatus;
  requestedBy: string | null;
  analysisTier: "standard" | "premium";
  depth: number;
  attemptCount: number;
  summary: Record<string, unknown> | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  positions: DraughtsAnalysisPosition[];
}

export interface DraughtsInsightBucket {
  key: string;
  moves: number;
  averageLoss: number;
  maxLoss: number;
  latestAt: string;
}

export interface DraughtsInsights {
  player: string;
  totalMistakes: number;
  motifs: DraughtsInsightBucket[];
  phases: DraughtsInsightBucket[];
  variants: DraughtsInsightBucket[];
  sides: DraughtsInsightBucket[];
  timeControls: DraughtsInsightBucket[];
}

export interface DraughtsCoachProgressItem {
  skillKey: string;
  level: number;
  attempts: number;
  successes: number;
  mastery: number;
  lastMatchId: string | null;
  lastPly: number | null;
  updatedAt: string;
}

export interface DraughtsCoachProgress {
  player: string;
  items: DraughtsCoachProgressItem[];
}

export type DraughtsCoachAction =
  | { type: "say"; text: string; tone: "neutral" | "positive" | "caution" | "critical" }
  | {
      type: "drawArrow";
      from: string;
      to: string;
      tone: "neutral" | "positive" | "caution" | "critical";
    }
  | { type: "choice"; id: string; label: string; action: "continue" | "undo" }
  | { type: "setControls"; hint: boolean; undo: boolean; menu: boolean; next: boolean };

export interface DraughtsCoachMoveReview {
  attemptId: string;
  matchId: string;
  ply: number;
  status: "review" | "continued" | "undone" | "stale";
  classification: DraughtsAnalysisClassification;
  motif: string;
  attemptedUci: string;
  attemptedSan: string;
  message: string;
  loss: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  bestUci: string | null;
  bestSan: string | null;
  principalVariation: string | null;
  canUndo: boolean;
  canContinue: boolean;
  actions: DraughtsCoachAction[];
  matchState: DraughtsMatch | null;
  createdAt: string;
}

export interface DraughtsCoachHint {
  id: string;
  matchId: string;
  ply: number;
  level: number;
  message: string;
  motif: string;
  suggestedUci: string | null;
  suggestedSan: string | null;
  actions: DraughtsCoachAction[];
  createdAt: string;
}

export interface DraughtsCoachSummary {
  outcome: "win" | "draw" | "loss" | "unresolved";
  resultReason: string | null;
  totalPlies: number;
  playerMoves: number;
  reviewedMoves: number;
  moveQuality: {
    best: number;
    good: number;
    inaccuracies: number;
    mistakes: number;
    blunders: number;
    averageLoss: number | null;
  };
  help: { hints: number; undos: number; usedHelp: boolean };
  message: string;
  finishedAt: string | null;
}

export interface DraughtsComputerCoachState {
  matchId: string;
  enabled: boolean;
  player: string;
  ply: number;
  canMove: boolean;
  awaitingResponse: boolean;
  hintLevel: number;
  pendingReview: DraughtsCoachMoveReview | null;
  summary: DraughtsCoachSummary | null;
  actions: DraughtsCoachAction[];
}

export interface DraughtsCoachChapter {
  key: string;
  title: string;
  instruction: string;
  variant: DraughtsVariant;
  fen: string;
  side: DraughtsSide;
  targetUci: string;
  hints: string[];
  successMessage: string;
}

export interface DraughtsCoachLesson {
  key: string;
  title: string;
  summary: string;
  difficulty: number;
  maximumPoints: number;
  prerequisiteLessonKeys: string[];
  chapters: DraughtsCoachChapter[];
}

export interface DraughtsCoachCatalog {
  version: number;
  maximumPoints: number;
  sections: Array<{
    key: string;
    title: string;
    summary: string;
    lessons: DraughtsCoachLesson[];
  }>;
}

export type DraughtsCoachExperience = "beginner" | "intermediate" | "advanced";
export type DraughtsCoachPreferredMode = "learn" | "play" | "train" | "lessons";

export interface DraughtsCoachHome {
  profile: {
    player: string;
    experience: DraughtsCoachExperience;
    onboardingComplete: boolean;
    preferredMode: DraughtsCoachPreferredMode;
    createdAt: string;
    updatedAt: string;
  };
  earnedPoints: number;
  maximumPoints: number;
  trainingPositionCount: number;
  recommendedLessonKey: string | null;
  lessons: Array<{
    lessonKey: string;
    status: "locked" | "available" | "inProgress" | "completed";
    earnedPoints: number;
    maximumPoints: number;
    completedChapters: number;
    totalChapters: number;
  }>;
}

export interface DraughtsCoachLessonAttempt {
  id: string;
  player: string;
  lessonKey: string;
  chapterKey: string;
  attemptedUci: string;
  legal: boolean;
  correct: boolean;
  score: number;
  message: string;
  nextHint: string | null;
  attempts: number;
  bestScore: number;
  completed: boolean;
  createdAt: string;
}

export interface DraughtsCoachTrainingItem {
  matchId: string;
  ply: number;
  side: DraughtsSide;
  phase: string;
  motif: string;
  classification: string;
  variant: DraughtsVariant;
  fen: string;
  playedUci: string | null;
  bestUci: string | null;
  principalVariation: string | null;
  loss: number | null;
  createdAt: string;
}

export interface DraughtsCoachTraining {
  player: string;
  items: DraughtsCoachTrainingItem[];
}

export interface DraughtsCoachTrainingAttempt {
  id: string;
  player: string;
  matchId: string;
  sourcePly: number;
  attemptedUci: string;
  legal: boolean;
  correct: boolean;
  attempts: number;
  hintLevel: number;
  message: string;
  suggestedUci: string | null;
  actions: DraughtsCoachAction[];
  createdAt: string;
}

export interface DraughtsPlayerPerf {
  perfKey: DraughtsPerfKey;
  rating: number;
  deviation: number;
  provisional: boolean;
  games: number;
  latestAt: string | null;
}

export interface DraughtsPlayerRatings {
  player: string;
  items: DraughtsPlayerPerf[];
}

export interface DraughtsRatingHistoryEntry {
  matchId: string;
  perfKey: DraughtsPerfKey;
  ratingBefore: number;
  ratingAfter: number;
  ratingDiff: number;
  createdAt: string;
}

export interface DraughtsRatingHistory {
  player: string;
  perfKey: DraughtsPerfKey;
  items: DraughtsRatingHistoryEntry[];
}
