// The featured banner's spotlight figures — prize pool, player count and the
// avatar stack — keyed by game id. These are live values with no feed yet, so
// they sit here as editorial content (the comp's numbers) until a real source
// is wired. A game left out of this map shows the banner with no stat column
// rather than an invented one. Shared by the desktop and mobile surfaces so the
// spotlight reads the same on both.

export interface FeaturedStat {
  // Pre-formatted for display, e.g. "50,000 USDC".
  prizePool?: string;
  // Raw count; the banner renders it compact ("12.4k players").
  players?: number;
  // Up to three avatar image URLs for the player stack.
  avatars?: string[];
}

export const FEATURED_STATS: Record<string, FeaturedStat> = {
  "last-standing": {
    prizePool: "50,000 USDC",
    players: 12400,
    avatars: [
      "/casino/arkade/player-1.png",
      "/casino/arkade/player-2.png",
      "/casino/arkade/player-3.png",
    ],
  },
};
