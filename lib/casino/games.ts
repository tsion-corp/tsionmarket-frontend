// The casino's game catalogue: which games exist, where they live, and how
// their tile is laid out. This is static product structure, not game data.
// Everything that changes (jackpots, who is playing, queue depth) comes from
// the presence API and is merged in at render.

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

export interface CasinoGame {
  // Matches the GameId the presence API reports for live games.
  id: string;
  name: string;
  category: GameCategory;
  size: TileSize;
  // Oversized text motif rendered behind the tile content.
  glyph: string;
  href: string | null;
  // Static one-liner describing the game itself, not its current state.
  note?: string;
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
    comingSoon: false,
  },
  // Sits beside Chess in the first row: the hero spans four of the six
  // columns, and "tall" is the two-column slot that pairs with it.
  {
    id: "last-standing",
    name: "Last Man Standing",
    category: "New",
    size: "tall",
    glyph: "⌛",
    href: "/casino/last-standing",
    note: "Outlast everyone, winner takes the pot",
    comingSoon: false,
  },
  {
    id: "draw",
    name: "Draw",
    category: "Draws",
    size: "tall",
    glyph: "✦",
    href: "/casino/draw",
    note: "Pick 5 numbers and a bonus",
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
// `nameOf` lets the hub search against localized game names; without it the
// catalogue's English names stand in.
export function filterGames(
  games: CasinoGame[],
  category: GameCategoryFilter,
  search: string,
  nameOf: (game: CasinoGame) => string = (game) => game.name
): CasinoGame[] {
  const q = search.trim().toLowerCase();
  return games.filter((g) => {
    const inCategory =
      category === "All games" ||
      category === g.category ||
      (category === "Coming soon" && g.comingSoon);
    return inCategory && (!q || nameOf(g).toLowerCase().includes(q));
  });
}
