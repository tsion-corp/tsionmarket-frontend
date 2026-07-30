// Demo fixtures for the casino screens that do not have a backend yet: the
// wins ticker, the chess lobby and market data, and the number draw. Each
// screen reads these through one import so swapping in a real API later is a
// single seam per feature.

export interface TickerWin {
  amount: string;
  game: string;
  user: string;
  time: string;
}

export const TICKER_WINS: TickerWin[] = [
  { amount: "₦694,100", game: "Chess pot", user: "8***7", time: "2m ago" },
  { amount: "₦304,500", game: "Draw · 5 matched", user: "k***0", time: "11m ago" },
  { amount: "52 USDC", game: "Chess spectator bet", user: "z***2", time: "18m ago" },
];

export interface LiveChessGame {
  white: string;
  black: string;
  // White's share of the eval bar, 0 to 100.
  evalPct: number;
  oddsWhite: string;
  oddsBlack: string;
  pot: string;
  viewers: number;
}

export const LIVE_CHESS_GAMES: LiveChessGame[] = [
  {
    white: "Chidi_M",
    black: "Renata_K",
    evalPct: 58,
    oddsWhite: "1.85",
    oddsBlack: "3.40",
    pot: "₦84,000",
    viewers: 312,
  },
  {
    white: "Femi_Q",
    black: "Ade_T",
    evalPct: 44,
    oddsWhite: "2.60",
    oddsBlack: "2.05",
    pot: "120 USDC",
    viewers: 189,
  },
  {
    white: "Zola_K",
    black: "Musa_B",
    evalPct: 67,
    oddsWhite: "1.42",
    oddsBlack: "5.20",
    pot: "₦210,000",
    viewers: 501,
  },
  {
    white: "Ibra_S",
    black: "Tolu_A",
    evalPct: 51,
    oddsWhite: "2.15",
    oddsBlack: "2.30",
    pot: "18 SOL",
    viewers: 96,
  },
];

export interface OpenChallenge {
  name: string;
  rating: number;
  // Stake in minor units plus its currency; the label is derived at render.
  stakeMinor: number;
  currency: "NGN" | "USDC" | "SOL";
  // Machine time control for the play screen, and the label shown in the row.
  tc: "3+2" | "5+3" | "10+0";
  tcLabel: string;
}

export const OPEN_CHALLENGES: OpenChallenge[] = [
  {
    name: "GrandmasterKay",
    rating: 2210,
    stakeMinor: 15_000_000,
    currency: "NGN",
    tc: "10+0",
    tcLabel: "10+0 Rapid",
  },
  {
    name: "nightowl_chess",
    rating: 1980,
    stakeMinor: 6_000,
    currency: "USDC",
    tc: "3+2",
    tcLabel: "3+2 Blitz",
  },
  {
    name: "Segun_Plays",
    rating: 1755,
    stakeMinor: 2_000_000,
    currency: "NGN",
    tc: "5+3",
    tcLabel: "5+3 Blitz",
  },
  {
    name: "queenside_raid",
    rating: 2050,
    stakeMinor: 400,
    currency: "SOL",
    tc: "10+0",
    tcLabel: "15+10 Rapid",
  },
  {
    name: "Amara_V",
    rating: 1890,
    stakeMinor: 4_500_000,
    currency: "NGN",
    tc: "3+2",
    tcLabel: "3+2 Blitz",
  },
];

// The demo opponent used by matchmaking, the play screen, and the invite
// landing, so the whole flow reads as one continuous match.
export const DEMO_OPPONENT = { name: "nightowl_chess", rating: 1980 };
export const DEMO_PLAYER = { name: "You", rating: 1842 };
export const DEMO_CHALLENGER = { name: "GrandmasterKay", rating: 2210 };

export const TIME_CONTROLS = ["3+2", "5+3", "10+0"] as const;
export type TimeControl = (typeof TIME_CONTROLS)[number];

// Seconds on each clock and the per-move increment for a time control.
export function timeControlSeconds(tc: TimeControl): { base: number; increment: number } {
  const [minutes, increment] = tc.split("+").map(Number);
  return { base: minutes * 60, increment };
}

// ----- Number draw -----

export const DRAW_ENTRY_COST_MINOR = 50_000; // ₦500 per entry, in kobo.
export const DRAW_MAIN_POOL = 49;
export const DRAW_MAIN_PICKS = 5;
export const DRAW_BONUS_POOL = 10;
export const DRAW_JACKPOT_LABEL = "₦12,480,000";

export interface PrizeTier {
  label: string;
  prize: string;
}

export const DRAW_PRIZE_TIERS: PrizeTier[] = [
  { label: "5 + bonus (jackpot)", prize: "₦12,480,000" },
  { label: "5 numbers", prize: "₦240,000" },
  { label: "4 numbers", prize: "₦8,500" },
  { label: "3 numbers", prize: "₦500" },
];

export interface PastDraw {
  date: string;
  // Five main numbers then the bonus.
  numbers: number[];
}

export const PAST_DRAWS: PastDraw[] = [
  { date: "Jul 27", numbers: [3, 11, 19, 27, 35, 6] },
  { date: "Jul 24", numbers: [2, 14, 22, 31, 44, 9] },
  { date: "Jul 21", numbers: [7, 18, 25, 33, 41, 2] },
  { date: "Jul 18", numbers: [5, 12, 20, 29, 38, 7] },
];

// Settled demo entries shown under the user's own on the entries screen.
export interface SettledDemoEntry {
  status: string;
  prize: string | null;
  main: number[];
  bonus: number;
  matched: number[];
}

export const SETTLED_DEMO_ENTRIES: SettledDemoEntry[] = [
  {
    status: "Drawn Jul 27 · 4 matched",
    prize: "₦8,500",
    main: [7, 14, 22, 31, 44],
    bonus: 3,
    matched: [7, 14, 22, 31],
  },
  {
    status: "Drawn Jul 24 · no match",
    prize: null,
    main: [1, 9, 17, 25, 33],
    bonus: 8,
    matched: [],
  },
];
