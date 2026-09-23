// Which chess mode a route is, in the analytics catalog's words.
//
// The chess app is one surface with six ways into it, and the route is what
// says which one the player chose. Three are pages of their own (puzzles,
// learn, watch); the other three are the lobby with a `setup` on the query
// string, which is how the vendored lobby distinguishes them.
//
// Kept as a pure function so the mapping can be tested without a router, and
// so there is one place to change when a mode moves.

import type { ChessMode } from "@/lib/analytics/events";

/** Pages that are a mode in their own right, longest prefix first. */
const MODE_BY_PREFIX: [string, ChessMode][] = [
  ["/casino/chess/puzzles", "puzzles"],
  ["/casino/chess/learn", "learn"],
  ["/casino/chess/watch", "watch"],
];

/** The lobby's own names for the three ways to start a game. */
const MODE_BY_SETUP: Record<string, ChessMode> = {
  friend: "challenge_friend",
  ai: "vs_computer",
  hook: "play_online",
};

/**
 * The mode a chess route represents, or null when it is not a mode at all.
 *
 * A null covers the lobby with nothing chosen yet, and the pages that are not
 * a way in (a game in progress, history, a leaderboard). Those report nothing
 * rather than being counted as a mode nobody picked.
 */
export function chessModeForRoute(pathname: string, search: string): ChessMode | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page = MODE_BY_PREFIX.filter(([prefix]) => path.startsWith(prefix)).sort(
    (left, right) => right[0].length - left[0].length
  )[0];
  if (page) return page[1];

  // Only the lobby reads `setup`; the same parameter elsewhere means nothing.
  if (path !== "/casino/chess") return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const setup = params.get("setup");
  return setup ? (MODE_BY_SETUP[setup] ?? null) : null;
}
