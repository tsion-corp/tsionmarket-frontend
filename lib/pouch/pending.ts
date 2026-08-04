// A bank transfer the user has confirmed sending that has not settled yet.
//
// The transfer screen forgets its onramp session when the funds sheet closes,
// so without this the dashboard shows an unchanged balance next to a live
// withdraw button while the money is still in flight. Persisting the confirmed
// session lets the balance card hold the withdraw button and explain the wait.
// Exposed as an external store (the same shape as lib/activity/read-state.ts)
// so the card can read it with useSyncExternalStore.

const KEY = "wsws.pouch.pending-onramp.v1";

// How long a confirmed transfer may hold the withdraw button. Settlement
// normally lands within ten minutes; past this the hold lifts even if the
// status poll never resolves, so an abandoned claim cannot lock withdrawals.
export const PENDING_ONRAMP_TTL_MS = 15 * 60 * 1000;

export interface PendingOnramp {
  sessionId: string;
  // Epoch ms when the user confirmed they had sent the money.
  confirmedAt: number;
}

function isPendingOnramp(value: unknown): value is PendingOnramp {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.sessionId === "string" &&
    p.sessionId !== "" &&
    typeof p.confirmedAt === "number" &&
    Number.isFinite(p.confirmedAt)
  );
}

// Snapshots must be referentially stable between notifications, so the value is
// cached rather than re-parsed from storage on every render. `undefined` means
// "not read yet"; `null` means "read, nothing pending".
let cached: PendingOnramp | null | undefined;
const listeners = new Set<() => void>();

function read(): PendingOnramp | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPendingOnramp(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribePendingOnramp(cb: () => void): () => void {
  listeners.add(cb);
  // A transfer confirmed in another tab should hold the button here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = undefined;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function pendingOnrampSnapshot(): PendingOnramp | null {
  if (cached === undefined) cached = read();
  return cached;
}

// Null on the server, so hydration starts with a free button and only holds it
// once the client has actually read a pending transfer.
export function serverPendingOnrampSnapshot(): PendingOnramp | null {
  return null;
}

export function savePendingOnramp(sessionId: string, confirmedAt: number): void {
  const next: PendingOnramp = { sessionId, confirmedAt };
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory value
    // still holds the button for this page; it just won't survive a reload.
  }
  notify();
}

export function clearPendingOnramp(): void {
  cached = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
  notify();
}

// Whether the stored transfer should still hold the withdraw button at `now`.
export function isPendingOnrampActive(
  pending: PendingOnramp | null,
  now: number
): pending is PendingOnramp {
  return pending != null && now - pending.confirmedAt < PENDING_ONRAMP_TTL_MS;
}
