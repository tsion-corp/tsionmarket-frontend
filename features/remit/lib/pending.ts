// The cross-border order currently in flight, persisted so a reload or a
// closed sheet cannot lose sight of money that has already moved.
//
// The review step forgets its state when the modal unmounts; without this a
// user who paid and then closed the sheet (or crashed mid-payout) would never
// see the order again. Persisting the order id lets the flow reopen straight
// into tracking. Same external-store shape as lib/pouch/pending.ts, so it can
// be read with useSyncExternalStore.

const KEY = "wsws.remit.pending-order.v1";

// How long a pending order is worth resuming. Payouts land in minutes; a
// needs_attention order is worth surfacing much longer so the user finds the
// "support is on it" state again rather than silence.
export const PENDING_REMIT_TTL_MS = 6 * 60 * 60 * 1000;

export interface PendingRemit {
  orderId: string;
  // Epoch ms when the order was created.
  createdAt: number;
  // Whether the deposit was actually funded from the wallet. An unfunded
  // order is only resumed to offer the retry, never presented as money sent.
  funded: boolean;
}

function isPendingRemit(value: unknown): value is PendingRemit {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.orderId === "string" &&
    p.orderId !== "" &&
    typeof p.createdAt === "number" &&
    Number.isFinite(p.createdAt) &&
    typeof p.funded === "boolean"
  );
}

// Snapshots must be referentially stable between notifications, so the value
// is cached rather than re-parsed from storage on every render. `undefined`
// means "not read yet"; `null` means "read, nothing pending".
let cached: PendingRemit | null | undefined;
const listeners = new Set<() => void>();

function read(): PendingRemit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPendingRemit(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribePendingRemit(cb: () => void): () => void {
  listeners.add(cb);
  // An order created in another tab should resume here too.
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

export function pendingRemitSnapshot(): PendingRemit | null {
  if (cached === undefined) cached = read();
  return cached;
}

// Null on the server, so hydration starts without a resume and only offers one
// once the client has actually read a pending order.
export function serverPendingRemitSnapshot(): PendingRemit | null {
  return null;
}

export function savePendingRemit(next: PendingRemit): void {
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory value
    // still tracks for this page; it just won't survive a reload.
  }
  notify();
}

export function clearPendingRemit(): void {
  cached = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
  notify();
}

// Whether the stored order is still worth resuming at `now`.
export function isPendingRemitActive(
  pending: PendingRemit | null,
  now: number
): pending is PendingRemit {
  return pending != null && now - pending.createdAt < PENDING_REMIT_TTL_MS;
}
