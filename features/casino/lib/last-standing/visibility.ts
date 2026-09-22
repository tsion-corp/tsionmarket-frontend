// Public and private games.
//
// "Public" means the game holds the lobby's single slot. "Private" means it is
// reachable only by its link: not listed, but fully playable by anyone who has
// the link. The contract knows nothing about either — every game it emits is
// indexed and served the same way — so the distinction is drawn here.
//
// The starter's choice is kept in this browser, which makes it authoritative
// for them and invisible to everyone else. The lobby therefore ALSO caps
// itself to one game, the lowest active id. That is a rule every client
// computes identically from the same list, so a private game started after a
// public one is hidden from everybody, not just its creator.

const KEY = "wsws.last-man.private.v1";

export interface LobbyGame {
  gameId: number;
}

function read(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
  } catch {
    // Private browsing, blocked storage, or a corrupt value. A reader who
    // cannot remember their own private games still gets a working lobby.
    return [];
  }
}

export function privateGameIds(): number[] {
  return read();
}

export function markPrivate(gameId: number): void {
  if (typeof window === "undefined") return;
  const ids = read();
  if (ids.includes(gameId)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ids, gameId]));
  } catch {
    // Not being able to remember it only costs this browser a lobby row.
  }
}

/**
 * The games the lobby lists.
 *
 * Two rules, in order: drop anything this browser started privately, then keep
 * only the lowest remaining id. The second is what makes "one public game"
 * true for every viewer rather than only for the starter.
 */
export function lobbyGames<T extends LobbyGame>(
  games: readonly T[],
  hidden: readonly number[]
): T[] {
  const secret = new Set(hidden);
  const listed = games.filter((game) => !secret.has(game.gameId));
  if (listed.length === 0) return [];
  const lowest = listed.reduce((best, game) => (game.gameId < best.gameId ? game : best));
  return [lowest];
}

/**
 * Whether a public game may be started right now.
 *
 * Only one can hold the lobby slot, so a second public game would take a slot
 * that is not free. A private game is always allowed: it never competes for it.
 */
export function canStartPublic<T extends LobbyGame>(
  games: readonly T[],
  hidden: readonly number[]
): boolean {
  return lobbyGames(games, hidden).length === 0;
}
