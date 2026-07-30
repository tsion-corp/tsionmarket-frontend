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

export type ChessTimeControl = "3+2" | "5+3" | "10+0" | "15+10";

export type ChessColor = "w" | "b";

export interface ChessPlayer {
  id: string;
  username: string;
  rating: number;
  walletAddress: string;
}

export type ChessMatchState =
  "awaiting_opponent" | "awaiting_stakes" | "in_progress" | "settled" | "cancelled";

export type ChessResult =
  | { kind: "checkmate"; winner: ChessColor }
  | { kind: "resignation"; winner: ChessColor }
  | { kind: "timeout"; winner: ChessColor }
  | { kind: "draw"; reason: "stalemate" | "agreement" | "repetition" | "insufficient" };

export interface ChessMatch {
  id: string;
  state: ChessMatchState;
  white: ChessPlayer | null;
  black: ChessPlayer | null;
  timeControl: ChessTimeControl;
  stake: TokenAmount;
  pot: TokenAmount;
  // Server-authoritative position. The client renders this; it never decides
  // legality for money purposes.
  fen: string;
  // Full move history in SAN, oldest first.
  moves: string[];
  // Seconds left on each clock at `clockUpdatedAt`, ticked locally between
  // server frames.
  clocks: Record<ChessColor, number>;
  clockUpdatedAt: string;
  turn: ChessColor;
  // Set once the match settles.
  result: ChessResult | null;
  // A drawn game spawns a rematch for the same stake with colours swapped;
  // this is that game. Null when the draw ended play, e.g. because a player
  // could no longer cover the stake.
  rematchId: string | null;
  // On a rematch, the drawn game it came from.
  rematchOf: string | null;
  // The colour with an outstanding draw offer, if any.
  drawOffered: ChessColor | null;
  spectatorCount: number;
  createdAt: string;
}

// A match listed in the lobby as joinable.
export interface ChessChallenge {
  id: string;
  creator: ChessPlayer;
  timeControl: ChessTimeControl;
  stake: TokenAmount;
  createdAt: string;
  // Present for invite-link challenges.
  inviteCode: string | null;
}

export interface CreateChessChallengeInput {
  stakeWei: string;
  timeControl: ChessTimeControl;
  // "invite" mints a shareable link; "auto" enters the matchmaking queue.
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
