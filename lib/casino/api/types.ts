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

// The controls offered on the create screen.
export const TIME_CONTROL_PRESETS: readonly ChessTimeControl[] = ["3+2", "5+3", "10+0", "15+10"];

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

// ----- Spectator betting -----

export type BetSelection = "white" | "draw" | "black";

export interface MarketOdds {
  white: number;
  draw: number;
  black: number;
  // Server's win probability for white, 0..100, used for the eval bar.
  whiteWinProbability: number;
  updatedAt: string;
}

export interface OddsPoint {
  at: string;
  white: number;
}

export interface BetSlip {
  id: string;
  matchId: string;
  selection: BetSelection;
  // Odds locked at placement; payouts settle against this, not the live price.
  lockedOdds: number;
  stake: TokenAmount;
  potentialPayout: TokenAmount;
  state: "pending" | "won" | "lost" | "void";
  placedAt: string;
}

export interface PlaceBetInput {
  matchId: string;
  selection: BetSelection;
  stakeWei: string;
  // The odds the user saw. The server rejects the bet if the price has moved
  // beyond tolerance, rather than silently filling at a worse number.
  expectedOdds: number;
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
