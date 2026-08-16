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
  // Oversized text motif; the fallback look when a game has no artwork.
  glyph: string;
  // Cover artwork (remote URL) and its accent as an rgb triplet ("52 211 153"),
  // composed into tint gradients at varying alphas by the tile.
  image?: string;
  tintRgb?: string;
  // Shows the "New" badge regardless of category.
  isNew?: boolean;
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
    image:
      "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=1600&q=80&auto=format&fit=crop",
    tintRgb: "52 211 153",
    isNew: true,
    href: "/casino/chess",
    note: "Staked head-to-head, invite or quick match",
    comingSoon: false,
  },
  // Sits beside Chess in the first row: the hero spans four of the six
  // columns, and "tall" is the two-column slot that pairs with it.
  {
    id: "last-standing",
    name: "The Last Man",
    category: "New",
    size: "tall",
    glyph: "⌛",
    image:
      "https://images.unsplash.com/photo-1518281420975-50db6e5d0a97?w=900&q=80&auto=format&fit=crop",
    tintRgb: "251 191 36",
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
    image:
      "https://images.unsplash.com/photo-1518688248740-7c31f1a945c4?w=900&q=80&auto=format&fit=crop",
    tintRgb: "167 139 250",
    href: null,
    note: "Pick 5 numbers and a bonus",
    comingSoon: true,
  },
  {
    id: "checkers",
    name: "Checkers",
    category: "Skill",
    size: "medium",
    glyph: "⛃",
    image: "https://upload.wikimedia.org/wikipedia/commons/3/30/International_draughts.jpg",
    tintRgb: "148 163 184",
    href: "/casino/checkers",
    isNew: true,
    note: "Fast staked matches",
    comingSoon: false,
  },
  {
    id: "powerball",
    name: "Arkball",
    category: "Draws",
    size: "medium",
    glyph: "●",
    image: "/casino/powerball/hero.png",
    tintRgb: "225 29 53",
    isNew: true,
    href: "/casino/arkball",
    note: "Pick 5 white balls and 1 Arkball",
    comingSoon: false,
  },
  {
    id: "ayo",
    name: "Ayo",
    category: "New",
    size: "medium",
    glyph: "◉",
    image:
      "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=900&q=80&auto=format&fit=crop",
    tintRgb: "251 146 60",
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
    image:
      "https://images.unsplash.com/photo-1541278107931-e006523892df?w=900&q=80&auto=format&fit=crop",
    tintRgb: "96 165 250",
    href: null,
    comingSoon: true,
  },
  {
    id: "racing",
    name: "Racing outrights",
    category: "Racing",
    size: "wide",
    glyph: "⚑",
    image:
      "https://images.unsplash.com/photo-1541348263662-e068662d82af?w=900&q=80&auto=format&fit=crop",
    tintRgb: "248 113 113",
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
