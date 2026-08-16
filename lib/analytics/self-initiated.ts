// The transactions this app caused itself, by hash.
//
// A deposit is money arriving from outside. Everything else that puts stablecoin
// back in the wallet looks identical in activity: selling a token, converting
// one, closing a perp, taking money out of a game balance. All of them are an
// inbound USDC transfer, and the sender does not separate them either, because
// sale proceeds settle through the same rail a deposit does.
//
// What does separate them is whether we did it. A transfer carried by a
// transaction this app sent, or by one that settled a request this app made, is
// not a deposit whatever it looks like on chain. Recording those hashes is the
// only exact way to tell the two apart, so this is deliberately a record of
// fact rather than a guess at amounts and timing.

const STORAGE_KEY = "wsws.analytics.self-initiated.v1";

// Comfortably more than a busy user's transactions between two visits to the
// activity screen, while keeping what we persist bounded.
export const MAX_REMEMBERED = 300;

// Hashes reach us from a wallet, an indexer and a payment provider, which do
// not agree on case. Compared lowercase so the same transaction matches itself.
export function normalizeHash(hash: string): string {
  return hash.trim().toLowerCase();
}

/**
 * The stored list after adding `incoming`, deduped and capped, oldest first.
 *
 * The cap drops the oldest, which is safe because activity is finite and
 * ordered: a hash old enough to fall out of here is old enough to have fallen
 * out of the feed that could mistake it for a deposit.
 */
export function mergeHashes(existing: readonly string[], incoming: readonly string[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const hash of [...existing, ...incoming]) {
    const normalized = normalizeHash(hash);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(normalized);
  }
  return kept.slice(Math.max(0, kept.length - MAX_REMEMBERED));
}

export function readSelfInitiated(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string").map(normalizeHash))
      : new Set();
  } catch {
    // A corrupt or unavailable store must not stop the app. The cost of an
    // empty set is that one visit could report a self-caused arrival as a
    // deposit, which is why the writes below are best effort but eager.
    return new Set();
  }
}

/**
 * Remembers transactions the app sent or settled, so the deposit watcher can
 * rule them out later. Safe to call repeatedly with the same hash.
 */
export function recordSelfInitiated(hashes: readonly string[]): void {
  if (typeof window === "undefined" || hashes.length === 0) return;
  try {
    const existing = [...readSelfInitiated()];
    const next = mergeHashes(existing, hashes);
    if (next.length === existing.length) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota. Nothing to do here: the watcher degrades to
    // its old behaviour for this device rather than the app failing.
  }
}
