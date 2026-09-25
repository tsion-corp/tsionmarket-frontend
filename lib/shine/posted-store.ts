"use client";

// The record of what Shine has already posted, and the one piece of this
// module that everything else depends on being right.
//
// WHY IT HAS TO SURVIVE A RELOAD
//
// Seven of this app's thirteen success signals are derived state from a poll
// or a socket. They re-fire on refetch, on remount and on tab refocus, and the
// worst of them re-serves every settled row every sixty seconds for as long as
// the tab is open. Behind a confirmation dialog that was harmless: the user saw
// the sheet again and closed it. As an automatic public post it is a duplicate
// nobody approved, on a feed with no deep link and therefore no way to correct
// it afterwards.
//
// The repo has four dedup patterns and only one survives a reload: the
// localStorage record behind clearPendingRwaSettlement in
// lib/trade/pending-settlement.ts. This follows it, including the bounded write
// and the tolerance for a stored value written by another build.
//
// WHY THE KEY INCLUDES THE ACCOUNT
//
// Sign-out clears exactly one localStorage key, the React Query snapshot, and
// no preference or marker is ever cleared. Without the DID in the key, the
// second person to sign in on a laptop inherits the first person's "already
// posted" set: their trades silently do not post, and ids that happen to
// collide across accounts go missing. The DID is what makes an account switch
// a clean slate without anything having to remember to clear this.
//
// WHY THERE IS NO IN-MEMORY MIRROR
//
// lib/trade/pending-settlement.ts caches its snapshot because a React store
// reads it during render. This is read a handful of times per session, from a
// queue, and two tabs of the same app both posting is a real case: a mirror
// that had gone stale against the other tab's write is exactly the duplicate
// this file exists to prevent. Every claim reads storage.

import type { ShineService } from "@/lib/shine/types";

export const SHINE_POSTED_KEY = "wsws.shine.posted.v1";

/**
 * How long a record is kept.
 *
 * It bounds how long a source can re-serve a row and still be caught. Ninety
 * days is far past the window any list in this app pages back through, and
 * short enough that a record for a coin the user traded once two years ago is
 * not still occupying the budget below.
 */
export const SHINE_POSTED_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Records kept per account, newest first.
 *
 * This is a budget, not a guess at usage: a heavy day is tens of posts, and
 * four hundred covers weeks of them. It exists because the real failure is not
 * a record being evicted, it is localStorage throwing QuotaExceededError on the
 * next write, at which point NOTHING can be claimed and Shine stops posting
 * for everyone on the device.
 */
export const SHINE_POSTED_MAX_PER_ACCOUNT = 400;

/**
 * Accounts kept, most recently active first.
 *
 * A shared device or a tester switching wallets should not grow this file
 * without limit. The account being written is always kept, whatever its
 * timestamp, because dropping the record we are in the middle of writing would
 * reopen the duplicate immediately.
 */
export const SHINE_POSTED_MAX_ACCOUNTS = 4;

export interface ShinePostedRecord {
  did: string;
  service: ShineService;
  id: string;
  /** When the post was claimed, which is just before it was sent. */
  at: number;
}

export type ShineClaimOutcome = "claimed" | "already-posted" | "storage-unavailable";

function isRecord(value: unknown): value is ShinePostedRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.did === "string" &&
    record.did !== "" &&
    typeof record.service === "string" &&
    typeof record.id === "string" &&
    record.id !== "" &&
    typeof record.at === "number" &&
    Number.isFinite(record.at)
  );
}

/**
 * Every stored record, or null when storage could not be read at all.
 *
 * Null and [] are different answers and must not be collapsed: [] means
 * "nothing has been posted", null means "this browser cannot tell us", and
 * they lead to opposite decisions.
 */
function read(): ShinePostedRecord[] | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SHINE_POSTED_KEY);
  } catch {
    // Storage is blocked. This browser cannot answer the question at all.
    return null;
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    // The stored value is not JSON: an older build's shape, or a write
    // truncated by a crash. Storage itself works, so start a fresh record
    // rather than leaving Shine permanently off on this device. The cost is
    // the dedup set that was already unreadable, and it is paid once.
    return [];
  }
}

/** True when the write landed durably. */
function write(records: readonly ShinePostedRecord[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SHINE_POSTED_KEY, JSON.stringify(records));
    return true;
  } catch {
    // Quota, or a private-mode browser that rejects writes. There is no
    // in-memory fallback on purpose: an in-memory record is exactly what a
    // reload loses, and a record that does not survive a reload is not a
    // record, it is a delay before the duplicate.
    return false;
  }
}

/**
 * Trim the stored set to its budget, keeping the account being written.
 *
 * Runs on every claim rather than on a timer, because a claim is the only
 * moment this file is on the hot path and the only moment growth happens.
 */
function prune(
  records: readonly ShinePostedRecord[],
  keepDid: string,
  now: number
): ShinePostedRecord[] {
  const fresh = records.filter((record) => now - record.at < SHINE_POSTED_TTL_MS);

  const lastSeen = new Map<string, number>();
  for (const record of fresh) {
    lastSeen.set(record.did, Math.max(lastSeen.get(record.did) ?? 0, record.at));
  }
  const others = [...lastSeen.keys()]
    .filter((did) => did !== keepDid)
    .sort((a, b) => (lastSeen.get(b) ?? 0) - (lastSeen.get(a) ?? 0))
    .slice(0, SHINE_POSTED_MAX_ACCOUNTS - 1);
  const kept = new Set([keepDid, ...others]);

  const perAccount = new Map<string, ShinePostedRecord[]>();
  // Oldest first, so slicing from the end keeps the newest.
  for (const record of [...fresh].sort((a, b) => a.at - b.at)) {
    if (!kept.has(record.did)) continue;
    const list = perAccount.get(record.did) ?? [];
    list.push(record);
    perAccount.set(record.did, list);
  }

  return [...perAccount.values()].flatMap((list) => list.slice(-SHINE_POSTED_MAX_PER_ACCOUNT));
}

function matches(record: ShinePostedRecord, did: string, service: ShineService, id: string) {
  return record.did === did && record.service === service && record.id === id;
}

/**
 * Whether this account has already had this event posted.
 *
 * Answers TRUE when storage cannot be read, which is the safe direction. See
 * `claimShinePost` for the reasoning.
 */
export function hasShinePosted(did: string, service: ShineService, id: string): boolean {
  const records = read();
  if (records === null) return true;
  return records.some((record) => matches(record, did, service, id));
}

/**
 * Take the right to post this event, writing the record BEFORE the post is
 * attempted.
 *
 * Order matters and this is the whole of it. If the record were written from a
 * success callback, a reload between send and callback would leave the app
 * believing nothing was posted, and the next poll tick would post it again.
 * Writing first inverts the risk: the failure mode becomes a post that was
 * claimed but never sent, which is a post nobody sees. That is the trade this
 * module is built to make.
 *
 * WHEN STORAGE IS UNREADABLE, NOTHING IS POSTED.
 *
 * features/tour/lib/tour-storage.ts fails toward "already seen" because the
 * cost of guessing wrong there is a tour shown twice. Here the two costs are
 * not comparable. Guessing "not posted" publishes a duplicate to a public feed
 * on every reload and refocus, permanently and with no way to retract it, for
 * as long as the session lasts. Guessing "posted" means a private-mode user
 * gets no Shine posts, which is invisible, reversible the moment storage works
 * again, and leaves them exactly the manual share button everyone had before
 * this feature existed. So this fails closed, in the same direction the tour
 * does and for the opposite reason.
 */
export function claimShinePost(
  did: string,
  service: ShineService,
  id: string,
  now: number = Date.now()
): ShineClaimOutcome {
  if (did === "" || id === "") return "storage-unavailable";
  const records = read();
  if (records === null) return "storage-unavailable";
  if (records.some((record) => matches(record, did, service, id))) return "already-posted";

  const next = prune([...records, { did, service, id, at: now }], did, now);
  return write(next) ? "claimed" : "storage-unavailable";
}

/** Everything stored, for tests and for a support surface to read. */
export function shinePostedRecords(): readonly ShinePostedRecord[] {
  return read() ?? [];
}
