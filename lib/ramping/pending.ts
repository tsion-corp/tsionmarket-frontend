// A bank transfer the user has confirmed sending that has not settled yet.
//
// Same job as lib/pouch/pending.ts, for the ramping rail: the transfer screen
// forgets its order when the funds sheet closes, so the dashboard would show a
// live withdraw button next to an unchanged balance while the money is still
// in flight. The confirmed order is persisted so the balance card can hold the
// button and explain the wait. External store shape so it reads through
// useSyncExternalStore.

const KEY = "wsws.ramping.pending-onramp.v1";

// How long a confirmed transfer may hold the withdraw button. The rail settles
// in seconds once the bank credit lands; past this the hold lifts even if the
// poll never resolves, so an abandoned claim cannot lock withdrawals.
export const PENDING_DEPOSIT_TTL_MS = 15 * 60 * 1000;

export interface PendingBankDeposit {
  orderId: string;
  // Epoch ms when the user confirmed they had sent the money.
  confirmedAt: number;
}

function isPendingBankDeposit(value: unknown): value is PendingBankDeposit {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.orderId === "string" &&
    p.orderId !== "" &&
    typeof p.confirmedAt === "number" &&
    Number.isFinite(p.confirmedAt)
  );
}

// Snapshots must be referentially stable between notifications, so the value is
// cached rather than re-parsed from storage on every render. `undefined` means
// "not read yet"; `null` means "read, nothing pending".
let cached: PendingBankDeposit | null | undefined;
const listeners = new Set<() => void>();

function read(): PendingBankDeposit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPendingBankDeposit(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribePendingBankDeposit(cb: () => void): () => void {
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

export function pendingBankDepositSnapshot(): PendingBankDeposit | null {
  if (cached === undefined) cached = read();
  return cached;
}

// Null on the server, so hydration starts with a free button and only holds it
// once the client has actually read a pending transfer.
export function serverPendingBankDepositSnapshot(): PendingBankDeposit | null {
  return null;
}

export function savePendingBankDeposit(orderId: string, confirmedAt: number): void {
  const next: PendingBankDeposit = { orderId, confirmedAt };
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory value
    // still holds the button for this page; it just won't survive a reload.
  }
  notify();
}

export function clearPendingBankDeposit(): void {
  cached = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
  notify();
}

// Whether the stored transfer should still hold the withdraw button at `now`.
export function isPendingBankDepositActive(
  pending: PendingBankDeposit | null,
  now: number
): pending is PendingBankDeposit {
  return pending != null && now - pending.confirmedAt < PENDING_DEPOSIT_TTL_MS;
}
