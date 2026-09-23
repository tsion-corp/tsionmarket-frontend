// Bank withdrawals this device has created and not yet seen end.
//
// A withdrawal used to be reported only if its screen was still open when the
// payout completed, and the rail can take minutes. The order is remembered here
// when it is created, and a watcher mounted on every signed-in page follows it
// to its end (features/funds/hooks/use-offramp-settlement), whatever the user
// did in between. The deposit rail keeps the same kind of record in
// ./onramp-watch.
//
// Nothing here is an account number or a transfer reference: the order id is
// the rail's own reference for the payout, and the bank is its registry name.

const KEY = "wsws.ramping.offramp-watch.v1";

// A payout that has not ended in a day is not going to be reported from here;
// the order stays visible in the rail's own history.
export const OFFRAMP_WATCH_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_WATCHES = 5;

export interface OfframpWatch {
  wallet: string;
  orderId: string;
  /** The customer's bank, as the registry names it. */
  bank: string;
  /** What left the balance, for a failure the rail reports no figures for. */
  amountUsd: number;
  openedAt: number;
}

function isWatch(value: unknown): value is OfframpWatch {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.wallet === "string" &&
    typeof w.orderId === "string" &&
    typeof w.bank === "string" &&
    typeof w.amountUsd === "number" &&
    typeof w.openedAt === "number"
  );
}

function prune(watches: readonly OfframpWatch[], now: number): OfframpWatch[] {
  return watches.filter((w) => now - w.openedAt < OFFRAMP_WATCH_TTL_MS).slice(-MAX_WATCHES);
}

// --- the store --------------------------------------------------------------

// useSyncExternalStore needs the same array back until something changes, so
// the parsed list is kept alongside the string it was parsed from and only
// parsed again when storage holds something else.
const EMPTY: OfframpWatch[] = [];
let cachedRaw: string | null = null;
let cached: OfframpWatch[] = EMPTY;
const listeners = new Set<() => void>();

function rawValue(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Unavailable storage: this device follows no withdrawals, and the screen
    // still shows the payout while it is open.
    return null;
  }
}

export function offrampWatches(): OfframpWatch[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = rawValue();
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const kept = Array.isArray(parsed) ? parsed.filter(isWatch) : [];
    cached = kept.length > 0 ? kept : EMPTY;
  } catch {
    // A corrupt record is dropped rather than stopping the app.
    cached = EMPTY;
  }
  return cached;
}

export function serverOfframpWatches(): OfframpWatch[] {
  return EMPTY;
}

function write(next: OfframpWatch[]): void {
  try {
    if (next.length > 0) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or a full quota: nothing is followed after the screen closes.
  }
  for (const cb of listeners) cb();
}

export function subscribeOfframpWatches(cb: () => void): () => void {
  listeners.add(cb);
  // A withdrawal started in another tab is the same withdrawal here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Remembers a withdrawal the moment the rail creates its order. */
export function openOfframpWatch(watch: Omit<OfframpWatch, "openedAt">, now: number): void {
  if (typeof window === "undefined" || !watch.wallet || !watch.orderId) return;
  const wallet = watch.wallet.toLowerCase();
  const existing = prune(offrampWatches(), now).filter((w) => w.orderId !== watch.orderId);
  write([...existing, { ...watch, wallet, openedAt: now }].slice(-MAX_WATCHES));
}

export function closeOfframpWatch(orderId: string, now: number): void {
  if (typeof window === "undefined" || !orderId) return;
  write(prune(offrampWatches(), now).filter((w) => w.orderId !== orderId));
}
