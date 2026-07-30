// The casino hub's game catalog. Tiles, categories, and presence lines are
// static product copy for now: only Last Man Standing and the flows linked below
// are live, the rest are teasers for what ships next.

export type GameCategory = "Skill" | "Cards" | "Draws" | "Racing" | "New";

export const GAME_CATEGORIES = [
  "All games",
  "Skill",
  "Cards",
  "Draws",
  "Racing",
  "New",
  "Coming soon",
] as const;

export type GameCategoryFilter = (typeof GAME_CATEGORIES)[number];

// Tile footprint on the hub's 6-column grid.
export type TileSize = "hero" | "tall" | "medium" | "wide";

export type TilePresence =
  | { kind: "playing"; label: string }
  | { kind: "entries"; label: string }
  | { kind: "queue"; label: string }
  | { kind: "befirst"; label: string };

export interface CasinoGame {
  id: string;
  name: string;
  category: GameCategory;
  size: TileSize;
  // Oversized text motif rendered behind the tile content.
  glyph: string;
  href: string | null;
  jackpot?: string;
  note?: string;
  presence?: TilePresence;
  comingSoon: boolean;
}

export const CASINO_GAMES: CasinoGame[] = [
  {
    id: "chess",
    name: "Chess",
    category: "Skill",
    size: "hero",
    glyph: "♞",
    href: "/casino/chess",
    note: "Staked head-to-head, invite or quick match",
    presence: { kind: "playing", label: "1,240 playing" },
    comingSoon: false,
  },
  {
    id: "draw",
    name: "Draw",
    category: "Draws",
    size: "tall",
    glyph: "✦",
    href: "/casino/draw",
    jackpot: "₦12,480,000",
    note: "Pick 5 numbers and a bonus",
    presence: { kind: "entries", label: "3,402 entries" },
    comingSoon: false,
  },
  {
    id: "last-standing",
    name: "Last Man Standing",
    category: "New",
    size: "medium",
    glyph: "⌛",
    href: "/casino/last-standing",
    note: "Outlast everyone, winner takes the pot",
    presence: { kind: "playing", label: "Live rounds" },
    comingSoon: false,
  },
  {
    id: "checkers",
    name: "Checkers",
    category: "Skill",
    size: "medium",
    glyph: "⛃",
    href: null,
    note: "Fast staked matches",
    presence: { kind: "queue", label: "86 in queue" },
    comingSoon: true,
  },
  {
    id: "ayo",
    name: "Ayo",
    category: "New",
    size: "medium",
    glyph: "◉",
    href: null,
    note: "Staked mancala, head-to-head",
    presence: { kind: "befirst", label: "Be the first" },
    comingSoon: true,
  },
  {
    id: "poker",
    name: "Poker",
    category: "Cards",
    size: "wide",
    glyph: "♠",
    href: null,
    comingSoon: true,
  },
  {
    id: "racing",
    name: "Racing outrights",
    category: "Racing",
    size: "wide",
    glyph: "⚑",
    href: null,
    comingSoon: true,
  },
];

// Category filter plus name search, mirroring the hub's chips and search box.
export function filterGames(
  games: CasinoGame[],
  category: GameCategoryFilter,
  search: string
): CasinoGame[] {
  const q = search.trim().toLowerCase();
  return games.filter((g) => {
    const inCategory =
      category === "All games" ||
      category === g.category ||
      (category === "Coming soon" && g.comingSoon);
    return inCategory && (!q || g.name.toLowerCase().includes(q));
  });
}
