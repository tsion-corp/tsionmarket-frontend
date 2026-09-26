// Public and private games.
//
// The contract knows the difference now. Since the v5.1 privacy upgrade
// (on-chain 2026-09-26) a game is started through the `bool isPrivate`
// overload, the vault emits GamePrivacySet, and every row it serves carries
// `isPrivate`. That flag is the truth, and publicGames in lib/vault-game.ts
// is what reads it.
//
// This file is what remains of the workaround that stood in before then: the
// starter's own choice, kept in this browser. It is still needed, for one
// window only. A game reaches the client before the reconciler has indexed its
// privacy log, and until it does the row honestly says public; without this
// the starter's private game appears in their own lobby for a few seconds.
//
// It only ever HIDES. One browser's list cannot reveal anything, and cannot
// affect what anybody else sees.
//
// Gone with the upgrade: the one-public-game cap. It existed because privacy
// was unenforceable — every client had to compute the same "only the lowest id
// is listed" rule for a private game to be hidden from anyone but its creator.
// With a real flag on every row there is nothing left for it to protect
// against, and it was hiding genuinely public games from the lobby.

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
