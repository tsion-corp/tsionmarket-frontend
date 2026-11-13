import { wipeBytes } from "./encoding";

/**
 * Who has the wallet key in memory right now, and for how long.
 *
 * The key lives in one module-level slot and nowhere else: never in storage,
 * never in React state. It expires after a stretch of inactivity (reset by
 * use) and after an absolute lifetime (never extended), and is zeroed when it
 * does. Switching to a different user or wallet clears it.
 */

export const IDLE_TIMEOUT_MS = 30 * 60_000;
export const MAX_LIFETIME_MS = 24 * 60 * 60_000;

interface Unlocked {
  userId: string;
  walletId: string;
  dek: Uint8Array;
  idleTimeoutMs: number;
  maxExpiresAt: number;
  expiresAt: number;
}

let state: Unlocked | undefined;
let clock: () => number = () => Date.now();

/** Tests only. */
export function setClockForTests(now: (() => number) | null): void {
  clock = now ?? (() => Date.now());
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Follow lock and unlock (for React's useSyncExternalStore). Returns the unsubscribe. */
export function subscribeUnlocked(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function clearUnlocked(): void {
  const was = state !== undefined;
  if (state) wipeBytes(state.dek);
  state = undefined;
  if (was) notify();
}

export function setUnlocked(
  userId: string,
  walletId: string,
  dek: Uint8Array,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  maxLifetimeMs = MAX_LIFETIME_MS
): void {
  clearUnlocked();
  const now = clock();
  state = {
    userId,
    walletId,
    dek: new Uint8Array(dek),
    idleTimeoutMs,
    maxExpiresAt: now + maxLifetimeMs,
    expiresAt: Math.min(now + idleTimeoutMs, now + maxLifetimeMs),
  };
  notify();
}

/** The key, if this user and wallet are unlocked and unexpired. Counts as activity. */
export function getUnlockedKey(userId: string, walletId: string): Uint8Array | undefined {
  if (!state || state.userId !== userId || state.walletId !== walletId) return undefined;
  const now = clock();
  if (state.expiresAt <= now || state.maxExpiresAt <= now) {
    // Read during a render, possibly: wipe now, but tell listeners after it.
    wipeBytes(state.dek);
    state = undefined;
    queueMicrotask(notify);
    return undefined;
  }
  state.expiresAt = Math.min(now + state.idleTimeoutMs, state.maxExpiresAt);
  return state.dek;
}

/**
 * Whether the wallet is unlocked right now, WITHOUT counting as activity. For showing
 * state on screen: reading it must not keep an idle wallet open. Use getUnlockedKey
 * when something is actually about to be signed.
 */
export function peekUnlocked(userId: string, walletId: string): boolean {
  if (!state || state.userId !== userId || state.walletId !== walletId) return false;
  const now = clock();
  return state.expiresAt > now && state.maxExpiresAt > now;
}

export const isUnlocked = (userId: string, walletId: string): boolean =>
  getUnlockedKey(userId, walletId) !== undefined;
