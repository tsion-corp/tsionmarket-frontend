// Dextopus settlement outlives the cashout panel and may finish after a reload.
// Persist only public request metadata; Dextopus remains the source of truth.

const STORAGE_KEY = "wsws.prediction.pending-cashouts.v1";
export const PENDING_CASHOUT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingPredictionCashout {
  requestId: string;
  wallet: string;
  expectedBaseUsdcRaw: string;
  createdAt: number;
  originTxHash?: string;
}

function isPendingPredictionCashout(value: unknown): value is PendingPredictionCashout {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.requestId === "string" &&
    item.requestId !== "" &&
    typeof item.wallet === "string" &&
    /^0x[0-9a-f]{40}$/i.test(item.wallet) &&
    typeof item.expectedBaseUsdcRaw === "string" &&
    /^\d+$/.test(item.expectedBaseUsdcRaw) &&
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt) &&
    (item.originTxHash === undefined ||
      (typeof item.originTxHash === "string" && /^0x[0-9a-f]+$/i.test(item.originTxHash)))
  );
}

export function parsePendingPredictionCashouts(raw: string | null): PendingPredictionCashout[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingPredictionCashout) : [];
  } catch {
    return [];
  }
}

let cached: readonly PendingPredictionCashout[] | undefined;
const listeners = new Set<() => void>();
const EMPTY_PENDING_CASHOUTS: readonly PendingPredictionCashout[] = [];

function read(): readonly PendingPredictionCashout[] {
  if (typeof window === "undefined") return EMPTY_PENDING_CASHOUTS;
  return parsePendingPredictionCashouts(window.localStorage.getItem(STORAGE_KEY));
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribePendingPredictionCashouts(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function pendingPredictionCashoutsSnapshot(): readonly PendingPredictionCashout[] {
  if (cached === undefined) cached = read();
  return cached;
}

export function serverPendingPredictionCashoutsSnapshot(): readonly PendingPredictionCashout[] {
  return EMPTY_PENDING_CASHOUTS;
}

function write(next: readonly PendingPredictionCashout[]): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory record still keeps reconciliation alive for this tab.
  }
  notify();
}

export function savePendingPredictionCashout(next: PendingPredictionCashout): void {
  const current = pendingPredictionCashoutsSnapshot().filter(
    (cashout) => cashout.requestId !== next.requestId
  );
  write([...current, next].slice(-8));
}

export function clearPendingPredictionCashout(requestId: string): void {
  write(pendingPredictionCashoutsSnapshot().filter((item) => item.requestId !== requestId));
}

export function isPendingPredictionCashoutActive(
  cashout: PendingPredictionCashout,
  now: number
): boolean {
  return now - cashout.createdAt < PENDING_CASHOUT_TTL_MS;
}
