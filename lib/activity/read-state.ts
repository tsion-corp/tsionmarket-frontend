// What the user has already seen in the notification bell.
//
// The toast hook keeps its own "seen ids" set, but that marks everything on
// first load so history never toasts — reusing it here would mean nothing is
// ever unread. Unread is a simpler question: did this land after the last time
// the bell was opened?
//
// Exposed as an external store so the bell can read it with
// useSyncExternalStore. Reading localStorage in an effect and calling setState
// would be a cascading render, and reading it during render would not survive
// hydration.

import type { ActivityEntry } from "@/lib/activity/entries";

const READ_KEY = "wsws.activity-read-at.v1";

// The badge stops counting past this and reads "9+", so a backfill cannot
// render a four-digit number.
export const UNREAD_CAP = 9;

// Snapshots must be referentially stable between notifications, so the value is
// cached rather than re-read from storage on every render.
let cached: number | null = null;
const listeners = new Set<() => void>();

function read(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(READ_KEY);
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) ? at : 0;
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeLastRead(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab acknowledging notifications should clear the badge here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === READ_KEY) {
      cached = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function lastReadSnapshot(): number {
  if (cached === null) cached = read();
  return cached;
}

// Zero on the server. The bell treats zero as "not known yet" and shows no
// badge, so hydration never flashes a count it then takes away.
export function serverLastReadSnapshot(): number {
  return 0;
}

export function markRead(at: number): void {
  cached = at;
  try {
    window.localStorage.setItem(READ_KEY, String(at));
  } catch {
    // A lost marker only risks showing the badge again, never hiding news.
  }
  notify();
}

// Records the first ever visit so a wallet with history does not greet the user
// with a badge for old transfers. Does nothing once a marker exists.
export function seedReadMarker(at: number): void {
  if (read() !== 0) return;
  markRead(at);
}

// Entries that landed after the last read, newest first.
//
// No clock is needed: the marker is seeded on first visit, so everything older
// is already read by construction. An entry with no usable timestamp is never
// unread, and a zero marker means "not known yet" rather than "read nothing".
export function unreadEntries(entries: ActivityEntry[], lastReadAt: number): ActivityEntry[] {
  if (lastReadAt <= 0) return [];
  return entries.filter((e) => e.timestamp > lastReadAt);
}

// What the badge shows: a count, or null when there is nothing to say.
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
}
