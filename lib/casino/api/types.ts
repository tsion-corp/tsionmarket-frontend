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

// The controls offered on the create screens.
// These are whole-game clocks, not per-move resets.
export const TIME_CONTROL_PRESETS: readonly ChessTimeControl[] = ["5+0", "10+0", "15+0"];

export type ChessColor = "w" | "b";

export interface ChessPlayer {
  id: string;
  username: string;
  rating: number;
  walletAddress: string;
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
}

export interface MatchmakingTicket {
  id: string;
  state: "searching" | "matched" | "expired";
  matchId: string | null;
  // Seconds left to accept once matched.
  acceptSecondsRemaining: number | null;
  opponent: ChessPlayer | null;
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
