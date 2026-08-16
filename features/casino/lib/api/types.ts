// Domain types for the casino games. These are our types, not the wire
// format: every response from the casino gateway passes through a normalizer
// before a component sees it.
//
// Money follows the same shape the vault gateway already uses across the
// platform: an exact on-chain amount plus its USD valuation, so screens can
// render dollars while stakes stay exact in minor units.

export interface TokenAmount {
  // Exact on-chain amount in the token's smallest unit, as a decimal string.
  // Never parsed into a float for arithmetic that settles money.
  wei: string;
  tokenSymbol: string;
  // Display valuation only.
  usdValue: number;
}

export type GameId = "chess" | "draw" | "last-standing";

// ----- Chess -----

// A time control reads as "minutes+increment", e.g. "5+3". The service accepts
// any number of seconds per side, so this is a string rather than a union: a
// game created elsewhere with an unusual control still has to display.
export type ChessTimeControl = string;

export type ChessClockMode = "real_time" | "unlimited";

export type ChessPerfKey = "ultraBullet" | "bullet" | "blitz" | "rapid" | "classical" | "standard";

export interface ChessComputerWager {
  stakeUsdc: string;
  houseExposureUsdc: string;
  potentialPayoutUsdc: string;
  feeBps: number;
  status: string;
  payoutUsdc: string;
}

export interface ChessComputerOpponent {
  player: string;
  name: string;
  side: "white" | "black";
  level: number;
  coachEnabled: boolean;
  hintsUsed: number;
  wager: ChessComputerWager | null;
}

// The controls offered on the create screens.
// These are whole-game clocks, not per-move resets.
export const TIME_CONTROL_PRESETS: readonly ChessTimeControl[] = ["1+0", "5+0", "10+0", "15+0"];

export type ChessColor = "w" | "b";

export interface ChessPlayer {
  id: string;
  username: string;
  // The backend now snapshots seat ratings onto rated matches. Null means the
  // seat was not rated for this game (for example a casual board or a not-yet-
  // seeded profile).
  rating: number | null;
  provisional?: boolean | null;
  walletAddress: string;
}

export interface ChessMatchRatingSide {
  rating: number | null;
  provisional: boolean | null;
  diff: number | null;
}

export interface ChessMatchRating {
  rated: boolean;
  perfKey: ChessPerfKey | null;
  white: ChessMatchRatingSide;
  black: ChessMatchRatingSide;
}

export interface ChessTimeExtensionState {
  allowed: boolean;
  used: number;
  totalSeconds: number;
  maxUses: number;
  maxTotalSeconds: number;
}

export type ChessMatchState = "awaiting_opponent" | "in_progress" | "settled" | "cancelled";

export type ChessResult =
  | { kind: "checkmate"; winner: ChessColor }
  | { kind: "resignation"; winner: ChessColor }
  | { kind: "timeout"; winner: ChessColor }
  | { kind: "draw"; reason: "stalemate" | "agreement" | "repetition" | "insufficient" };

export interface ChessTakebackState {
  white: boolean;
  black: boolean;
  takebackable: boolean;
}

export interface ChessRematchState {
  offeredBy: string | null;
  nextMatchId: string | null;
}

export type ChessChatRoom = "player" | "spectator";

export interface ChessChatMessage {
  id: number;
  matchId: string;
  room: ChessChatRoom;
  author: string;
  text: string;
  createdAt: string;
}

export interface ChessMatchNote {
  matchId: string;
  player: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChessMatchComment {
  id: string;
  matchId: string;
  ply: number;
  fen: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

// A match is free unless it carries a stake: staked games settle server-side
// through the chess cashier, so the client renders amounts but never moves
// money itself.
export interface ChessMatch {
  id: string;
  state: ChessMatchState;
  white: ChessPlayer | null;
  black: ChessPlayer | null;
  timeControl: ChessTimeControl;
  clockMode: ChessClockMode;
  // Present only when the other seat is controlled by the backend Stockfish
  // worker. The server owns the bot identity, side and strength.
  computer: ChessComputerOpponent | null;
  // Server-authoritative position. The client renders this; it never decides
  // legality itself.
  fen: string;
  // Full move history in SAN, oldest first.
  moves: string[];
  // Seconds left on each clock at `clockUpdatedAt`, ticked locally between
  // server frames.
  clocks: Record<ChessColor, number>;
  clockUpdatedAt: string;
  turn: ChessColor;
  // Set once the game ends.
  result: ChessResult | null;
  // The colour with an outstanding draw offer, if any.
  drawOffered: ChessColor | null;
  // Pending takeback offer state, if the match type allows takebacks at all.
  takeback: ChessTakebackState;
  // Lila-style rematch state carried on the finished match.
  rematch: ChessRematchState;
  // Paid extensions are only available on casual, unstaked, real-time PvP
  // games that opted in when the challenge was created.
  timeExtensions: ChessTimeExtensionState;
  // Rating snapshot for this match, including post-game diffs once settled.
  rating?: ChessMatchRating;
  // Per-player USDC stake for a wager-backed match, null when played for free.
  // Stakes settle server-side through the chess cashier.
  stakeUsdc: string | null;
  // The wager lifecycle as the service reports it (e.g. active, settled,
  // refunded); null for free games.
  wagerStatus: string | null;
  // WS-gateway topic carrying this match's live frames.
  liveTopic: string;
  createdAt: string;
}

// A match listed in the lobby as joinable.
export interface ChessChallenge {
  id: string;
  creator: ChessPlayer;
  timeControl: ChessTimeControl;
  createdAt: string;
  // The match id, which is what an invite link carries.
  inviteCode: string | null;
  // Per-player USDC stake, null for a free game.
  stakeUsdc: string | null;
}

export interface CreateChessChallengeInput {
  timeControl: ChessTimeControl;
  // "invite" produces a shareable link; "auto" pairs with whoever is waiting.
  mode: "invite" | "auto";
  // Human PvP is always rated. Computer and coaching flows use separate APIs.
  rated?: true;
  allowTimeExtensions?: boolean;
}

export interface CreateComputerMatchInput {
  level: number;
  color: "white" | "black" | "random";
  timeMode: ChessClockMode;
  initialSeconds?: number;
  incrementSeconds?: number;
  stakeUsdc?: string | null;
  coachEnabled?: boolean;
}

export interface ChessCoachChapter {
  key: string;
  title: string;
  instruction: string;
  fen: string;
  side: "white" | "black";
  targetUci: string;
  hints: string[];
  successMessage: string;
}

export interface ChessCoachLesson {
  key: string;
  title: string;
  summary: string;
  difficulty: number;
  maximumPoints: number;
  prerequisiteLessonKeys: string[];
  chapters: ChessCoachChapter[];
}

export interface ChessCoachSection {
  key: string;
  title: string;
  summary: string;
  lessons: ChessCoachLesson[];
}

export interface ChessCoachCatalog {
  version: number;
  maximumPoints: number;
  sections: ChessCoachSection[];
}

export type ChessCoachExperience = "beginner" | "intermediate" | "advanced";
export type ChessCoachPreferredMode = "learn" | "play" | "train" | "lessons";
export type ChessCoachLessonStatus = "locked" | "available" | "inProgress" | "completed";

export interface ChessCoachProfile {
  player: string;
  experience: ChessCoachExperience;
  onboardingComplete: boolean;
  preferredMode: ChessCoachPreferredMode;
  createdAt: string;
  updatedAt: string;
}

export interface ChessCoachLessonState {
  lessonKey: string;
  status: ChessCoachLessonStatus;
  earnedPoints: number;
  maximumPoints: number;
  completedChapters: number;
  totalChapters: number;
}

export interface ChessCoachHome {
  profile: ChessCoachProfile;
  earnedPoints: number;
  maximumPoints: number;
  trainingPositionCount: number;
  recommendedLessonKey: string | null;
  lessons: ChessCoachLessonState[];
}

export interface ChessCoachTrainingItem {
  matchId: string;
  ply: number;
  side: "white" | "black";
  phase: ChessAnalysisPhase;
  motif: ChessAnalysisMotif;
  classification: Exclude<ChessAnalysisClassification, "best" | "good">;
  fen: string;
  playedUci: string;
  playedSan: string;
  bestUci: string | null;
  bestSan: string | null;
  principalVariation: string | null;
  centipawnLoss: number | null;
  createdAt: string;
}

export interface ChessCoachTraining {
  player: string;
  items: ChessCoachTrainingItem[];
}

export type ChessCoachAction =
  | { type: "say"; text: string; tone: "neutral" | "positive" | "caution" | "critical" }
  | {
      type: "drawArrow";
      from: string;
      to: string;
      tone: "neutral" | "positive" | "caution" | "critical";
    }
  | { type: "choice"; id: string; label: string; action: "continue" | "undo" }
  | { type: "setControls"; hint: boolean; undo: boolean; menu: boolean; next: boolean };

export type ChessCoachMoveStatus =
  "warning" | "applying" | "accepted" | "overridden" | "review" | "continued" | "undone" | "stale";

export interface ChessCoachMoveReview {
  attemptId: string;
  matchId: string;
  ply: number;
  status: ChessCoachMoveStatus;
  classification: ChessAnalysisClassification;
  motif: ChessAnalysisMotif;
  attemptedUci: string;
  attemptedSan: string;
  message: string;
  centipawnLoss: number | null;
  winChanceLoss: number | null;
  bestUci: string | null;
  bestSan: string | null;
  principalVariation: string | null;
  canRetry: boolean;
  canOverride: boolean;
  canUndo: boolean;
  canContinue: boolean;
  actions: ChessCoachAction[];
  matchState: ChessMatch | null;
  createdAt: string;
}

export interface ChessComputerCoachState {
  matchId: string;
  enabled: boolean;
  player: string;
  ply: number;
  canMove: boolean;
  awaitingResponse: boolean;
  hintLevel: number;
  pendingWarning: ChessCoachMoveReview | null;
  pendingReview: ChessCoachMoveReview | null;
  summary: ChessComputerCoachSummary | null;
  actions: ChessCoachAction[];
}

export interface ChessComputerCoachSummary {
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
    averageCentipawnLoss: number | null;
    averageWinChanceLoss: number | null;
  };
  help: {
    hints: number;
    undos: number;
    usedHelp: boolean;
  };
  message: string;
  finishedAt: string | null;
}

export interface ChessCoachHint {
  id: string;
  matchId: string;
  ply: number;
  level: number;
  message: string;
  motif: ChessAnalysisMotif;
  suggestedUci: string | null;
  suggestedSan: string | null;
  actions: ChessCoachAction[];
  createdAt: string;
}

export interface ChessCoachLessonAttempt {
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

export interface ChessCoachTrainingAttempt {
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
  actions: ChessCoachAction[];
  createdAt: string;
}

export interface MatchmakingTicket {
  id: string;
  state: "searching" | "matched" | "expired";
  matchId: string | null;
  // Seconds left to accept once matched.
  acceptSecondsRemaining: number | null;
  opponent: ChessPlayer | null;
}

export type ChessAnalysisStatus = "queued" | "running" | "completed" | "failed";

export type ChessAnalysisPhase = "opening" | "middlegame" | "endgame";

export type ChessAnalysisMotif =
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

export type ChessAnalysisClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface ChessAnalysisMove {
  ply: number;
  player: string;
  side: "white" | "black";
  openingBucket: string;
  timeControl: string;
  phase: ChessAnalysisPhase;
  motif: ChessAnalysisMotif;
  classification: ChessAnalysisClassification;
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
  accuracyPercent: number | null;
  coachComment: string;
  createdAt: string;
}

export interface ChessAnalysisPlayerSummary {
  side: "white" | "black";
  accuracyPercent: number | null;
  averageCentipawnLoss: number | null;
  bestMoves: number;
  goodMoves: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

export interface ChessMatchAnalysis {
  matchId: string;
  analysed: boolean;
  status: ChessAnalysisStatus;
  requestOrigin: "manual" | "system";
  requestedBy: string | null;
  requestCount: number;
  depth: number;
  tier: "standard" | "premium";
  engineName: string | null;
  failure: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  createdAt: string;
  summaries: ChessAnalysisPlayerSummary[];
  moves: ChessAnalysisMove[];
}

export type ChessProductKey =
  "coach_monthly" | "hint_credit" | "time_extension_credit" | "premium_review_credit";

export interface ChessProductCatalogItem {
  key: ChessProductKey;
  name: string;
  description: string;
  priceUsdc: string;
}

export interface ChessProductAccess {
  player: string;
  coachActive: boolean;
  coachUntil: string | null;
  hintCredits: number;
  timeExtensionCredits: number;
  premiumReviewCredits: number;
  updatedAt: string;
}

export interface ChessProductPurchase {
  id: string;
  player: string;
  productKey: ChessProductKey;
  priceUsdc: string;
  status: string;
  createdAt: string;
  access: ChessProductAccess;
}

export interface ChessComputerHint {
  id: string;
  matchId: string;
  ply: number;
  suggestedUci: string;
  createdAt: string;
}

export interface ChessPlayerPerf {
  perfKey: ChessPerfKey;
  rating: number;
  deviation: number;
  provisional: boolean;
  games: number;
  latestAt: string | null;
}

export interface ChessPlayerRatings {
  player: string;
  items: ChessPlayerPerf[];
}

export interface ChessRatingHistoryEntry {
  matchId: string;
  perfKey: ChessPerfKey;
  ratingBefore: number;
  ratingAfter: number;
  ratingDiff: number;
  createdAt: string;
}

export interface ChessRatingHistory {
  player: string;
  perfKey: ChessPerfKey;
  items: ChessRatingHistoryEntry[];
}

export interface ChessInsightBucket {
  key: string;
  games: number;
  averageCpLoss: number;
  maxCpLoss: number;
  latestAt: string;
}

export interface ChessWeaknessProfile {
  player: string;
  generatedAt: string;
  totalMistakes: number;
  openings: ChessInsightBucket[];
  phases: ChessInsightBucket[];
  sides: ChessInsightBucket[];
  timeControls: ChessInsightBucket[];
  motifs: ChessInsightBucket[];
}

export interface ChessCoachProgressItem {
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

export interface ChessCoachProgress {
  player: string;
  totalEntries: number;
  completedEntries: number;
  items: ChessCoachProgressItem[];
}

// ----- Spectator betting (pari-mutuel) -----
//
// Stakes on an outcome form pools; when the match ends the winning pool splits
// the losing pool minus a house rake, pro-rata by stake. Nothing is locked at
// bet time: the price floats as money enters, so a bet's real payout is only
// known at settlement. Money is USDC decimal strings, the same units the chess
// cashier holds, never floats for arithmetic.

export type BetSelection = "white" | "draw" | "black";

export type MarketStatus = "open" | "settled" | "voided";

export type BetState = "active" | "won" | "lost" | "refunded";

// One outcome's side of the market. `pool` is the USDC staked on it; `odds` is
// the server's pari-mutuel price (total / pool), null when the pool is empty
// and therefore has no price yet.
export interface MarketOutcome {
  pool: string;
  odds: number | null;
}

// The live market for one match. `winningOutcome` and `voidReason` are set once
// the match settles or voids (a one-sided pool or a nobody-backed winner
// refunds every stake).
export interface MarketOdds {
  status: MarketStatus;
  total: string;
  outcomes: Record<BetSelection, MarketOutcome>;
  // Some game modules expose their configured rake with the market. Older
  // chess responses do not, so callers retain their service-config fallback.
  rakeBps?: number;
  winningOutcome: BetSelection | null;
  voidReason: string | null;
}

export interface BetSlip {
  id: string;
  matchId: string;
  selection: BetSelection;
  stakeUsdc: string;
  state: BetState;
  // Winnings once settled (stake + share of the losing pool) or the refunded
  // stake; null while the bet is still active.
  payoutUsdc: string | null;
  placedAt: string | null;
}

export interface PlaceBetInput {
  matchId: string;
  // The bettor's wallet. A player cannot bet on their own match; the service
  // rejects that with FORBIDDEN.
  bettor: string;
  selection: BetSelection;
  stakeUsdc: string;
}

// ----- Draw -----

export interface DrawRound {
  id: string;
  // ISO timestamp the round closes; the countdown derives from this rather
  // than a server-supplied seconds value, so it survives reloads.
  closesAt: string;
  jackpot: TokenAmount;
  entryCost: TokenAmount;
  mainPool: number;
  mainPicks: number;
  bonusPool: number;
  prizeTiers: DrawPrizeTier[];
  state: "open" | "drawing" | "settled";
}

export interface DrawPrizeTier {
  // Main numbers matched for this tier.
  matches: number;
  bonusRequired: boolean;
  prize: TokenAmount;
  label: string;
}

export interface DrawResult {
  roundId: string;
  drawnAt: string;
  mainNumbers: number[];
  bonusNumber: number;
}

export interface DrawEntry {
  id: string;
  roundId: string;
  mainNumbers: number[];
  bonusNumber: number;
  cost: TokenAmount;
  state: "open" | "won" | "lost";
  // Set once the round settles.
  matchedNumbers: number[] | null;
  bonusMatched: boolean | null;
  prize: TokenAmount | null;
  createdAt: string;
}

export interface CreateDrawEntryInput {
  roundId: string;
  mainNumbers: number[];
  bonusNumber: number;
  // How many identical entries to buy.
  quantity: number;
}

// ----- Hub -----

export interface RecentWin {
  id: string;
  game: GameId;
  gameLabel: string;
  // Masked handle, e.g. "8***7". The gateway masks it; we never receive the
  // full identity of another player.
  playerHandle: string;
  amount: TokenAmount;
  wonAt: string;
}

export interface GamePresence {
  game: GameId;
  playersOnline: number;
  inQueue: number;
  // Headline figure for the tile, already formatted by the gateway when the
  // game has one (e.g. the draw jackpot).
  headline: TokenAmount | null;
}
