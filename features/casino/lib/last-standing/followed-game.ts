"use client";

// Which game the floating timer follows.
//
// v3 had one game, so the pop-out timer had nothing to choose. v4 runs many at
// once, and the only sensible answer to "which clock is the user watching" is
// the last game they actually put money into: the one they started, or the one
// they most recently joined. That is remembered here.
//
// Kept in a module store rather than React state because the pop-out is mounted
// above the pages, next to nothing that knows about a game, and persisted so
// the timer survives a reload while the round is still running.

const STORAGE_KEY = "wsws.last-standing.followed-game.v1";

let current: number | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Called after starting or joining, so the pop-out tracks that game. */
export function followGame(gameId: number): void {
  if (current === gameId) return;
  current = gameId;
  hydrated = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(gameId));
  } catch {
    // Private mode. The timer still follows it for this session.
  }
  emit();
}

/** Called when the followed game settles, so a dead clock is not tracked. */
export function unfollowGame(): void {
  if (current === null && hydrated) return;
  current = null;
  hydrated = true;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to undo.
  }
  emit();
}

export function subscribeFollowedGame(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function followedGameSnapshot(): number | null {
  // Read through on first access rather than at module load, which would run
  // on the server where there is no localStorage.
  if (!hydrated) {
    hydrated = true;
    current = typeof window === "undefined" ? null : read();
  }
  return current;
}

/** Always null on the server, so the markup matches the first client paint. */
export function followedGameServerSnapshot(): number | null {
  return null;
}
