import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Who held a Privy account, as a file rather than a service.
//
// The question is "was this address one of ours before the migration", and the
// answer never changes: nobody signs up to Privy any more, so the population is
// closed and only shrinks. That is why this can be a snapshot — an email in the
// export is still in the export tomorrow. What DOES change is the balance, and
// that is never read from here: the route reads it live from the address below.
//
// Emails are stored only as sha256(lowercased). The file therefore carries no
// readable address, which is what makes it safe to commit, to serve from a
// published URL, and to leak. Never put raw emails in it: a directory of every
// user's email in one downloadable file is a far worse exposure than the
// per-user lookup it replaces.
//
// Format, header optional:
//
//   sha256_email,evm,solana
//   a94a8fe5ccb19ba61c4c...,0x7C77...,4sxCV8...
//
// Source, in order:
//   1. LEGACY_DIRECTORY_URL — a published CSV, re-read on a TTL. For updating
//      the list without a deploy; the only mode that touches the network.
//   2. config/legacy-directory.csv — bundled, read once. No runtime dependency
//      on anything, refreshed when you deploy. Needs the tracing entry in
//      next.config.ts to survive a serverless build, or the file is not there.
//
// Absent or unreadable, every lookup answers "unknown", never "no". A missing
// file must not tell a user they have nothing.
//
// The corollary, which matters more: a PRESENT file is believed completely. A
// partial export, a placeholder, or a sample committed "to make it work" turns
// every real user into a definite "no" — worse than having no file at all,
// because unknown falls through to Privy and no does not. Ship the whole
// export or ship nothing.

export interface LegacyDirectoryEntry {
  evm: string | null;
  solana: string | null;
}

export interface LegacyLookup {
  /** null when the directory could not be read at all — not the same as false. */
  known: boolean | null;
  entry: LegacyDirectoryEntry | null;
}

const BUNDLED_PATH = join(process.cwd(), "config", "legacy-directory.csv");
// How long a fetched copy is reused. Nothing fetches on a schedule — the first
// search does, and this only decides whether the next search reuses that answer
// or downloads the sheet again. A minute by default: short is affordable
// because a stale copy is SERVED while the new one is fetched, so shortening it
// costs requests to the sheet, never latency to a user.
//
// LEGACY_DIRECTORY_TTL_MS overrides it without a deploy. 0 means every search
// downloads the sheet and waits for it — correct, and the most expensive
// option, since a CSV cannot be queried for one row: the unit is the whole
// file, so it is ~1 MB per lookup at ten thousand members.
const DEFAULT_REFRESH_MS = 60 * 1000;

function refreshMs(): number {
  const raw = Number(process.env.LEGACY_DIRECTORY_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REFRESH_MS;
}

let table: Map<string, LegacyDirectoryEntry> | null = null;
let loadedAt = 0;
let loading: Promise<Map<string, LegacyDirectoryEntry> | null> | null = null;

export function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
}

/** The stored form of an email. */
export function emailIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

/** The stored form of an X account keyed by its numeric id. */
export function xIdentifier(userId: string): string {
  return `x:${userId.trim()}`;
}

/**
 * The stored form of an X account keyed by its @handle.
 *
 * Weaker than the numeric id and used because the Privy export carries only
 * handles. A handle can be released by its owner and registered by somebody
 * else, so this can match the wrong person — but what that person then gets is
 * an offer to migrate, not the money: the sweep signs with the OLD Privy
 * account, which needs the original owner's credentials. So the exposure is
 * "this handle had an account, at these public on-chain addresses", never
 * access to it.
 *
 * Namespaced apart from the id form so the two can never be confused.
 */
export function xHandleIdentifier(handle: string): string {
  return `x:@${handle.trim().replace(/^@/, "").toLowerCase()}`;
}

// Tolerant on purpose: a hand-exported sheet arrives with a header row, stray
// quotes, blank lines and a trailing comma, and none of that is worth failing
// the whole directory over.
export function parseLegacyDirectory(csv: string): Map<string, LegacyDirectoryEntry> {
  const rows = new Map<string, LegacyDirectoryEntry>();
  for (const line of csv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [rawHash, rawEvm, rawSolana] = trimmed
      .split(",")
      .map((cell) => cell.trim().replace(/^"|"$/g, ""));
    // A header, or anything that is not a sha256, is skipped rather than stored.
    if (!rawHash || !/^[0-9a-f]{64}$/i.test(rawHash)) continue;
    rows.set(rawHash.toLowerCase(), {
      evm: rawEvm || null,
      solana: rawSolana || null,
    });
  }
  return rows;
}

// Identifiers are never logged, only their kind and a short hash prefix. The
// prefix is enough to correlate a lookup with a row while you are testing, and
// useless to anyone reading the logs later.
const tag = (identifier: string) =>
  `${identifier.startsWith("x:@") ? "x-handle" : identifier.startsWith("x:") ? "x-id" : "email"}:${hashIdentifier(identifier).slice(0, 8)}`;

async function read(): Promise<Map<string, LegacyDirectoryEntry> | null> {
  const url = process.env.LEGACY_DIRECTORY_URL;
  try {
    const raw = url
      ? await (async () => {
          const res = await fetch(url, { cache: "no-store" });
          return res.ok ? res.text() : null;
        })()
      : await readFile(BUNDLED_PATH, "utf8");
    if (raw === null) return null;

    const rows = parseLegacyDirectory(raw);
    console.log(
      `[migrate] directory loaded: ${rows.size} rows from ${url ? "LEGACY_DIRECTORY_URL" : BUNDLED_PATH}`
    );
    // Zero rows is treated as unreadable, never as "nobody is a member". The
    // likeliest cause is a URL pointing at the sheet's /edit page rather than
    // its CSV export, which answers 200 with HTML: the parser finds no hashes,
    // and an empty directory would answer a definite no for every user on the
    // platform. An export with no members is not a thing worth supporting.
    return rows.size > 0 ? rows : null;
  } catch (err) {
    // No file, no network, malformed — all the same answer: unknown.
    console.warn(
      `[migrate] directory unreadable (${url ? "url" : "bundled file"}), falling through to Privy:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function refresh(): Promise<Map<string, LegacyDirectoryEntry> | null> {
  loading ??= read().then((loaded) => {
    // A failed read leaves the last good copy in place. Losing the directory
    // because the sheet blipped would turn known members into unknowns.
    if (loaded) {
      table = loaded;
      loadedAt = Date.now();
    }
    loading = null;
    return loaded;
  });
  return loading;
}

async function directory(): Promise<Map<string, LegacyDirectoryEntry> | null> {
  // The bundled file cannot change under a running server, so it is read once
  // and kept; only a URL is re-read.
  if (table && !process.env.LEGACY_DIRECTORY_URL) return table;

  const ttl = refreshMs();
  // A zero window is a deliberate "never reuse": wait for a fresh copy rather
  // than answering from the one in hand.
  if (ttl === 0) return (await refresh()) ?? table;

  if (table) {
    // Stale-while-revalidate. The copy in hand answers now, and a stale one is
    // fetched behind the request rather than in front of it — otherwise one
    // user per instance per window waits on the sheet to answer a question
    // that is a Set lookup the rest of the time.
    if (Date.now() - loadedAt >= ttl) void refresh().catch(() => {});
    return table;
  }

  // Nothing cached yet: this one has to wait.
  return (await refresh()) ?? table;
}

/**
 * Was any of these identifiers one of ours, and at which wallets?
 *
 * Several because a caller knows different things about different users: an
 * email for a Google sign-in, an X id for an X one, sometimes both. The first
 * hit wins and the rest are not consulted.
 *
 * `known: null` means the directory could not be read — NOT that nobody
 * matched. Callers must fall through rather than answer "no".
 */
export async function lookupLegacyIdentifiers(
  identifiers: readonly string[]
): Promise<LegacyLookup> {
  const rows = await directory();
  if (!rows) {
    console.log("[migrate] lookup: directory unavailable -> unknown (will try Privy)");
    return { known: null, entry: null };
  }
  const tried = identifiers.filter(Boolean);
  for (const identifier of tried) {
    const entry = rows.get(hashIdentifier(identifier));
    if (entry) {
      console.log(
        `[migrate] lookup: HIT on ${tag(identifier)} -> evm=${entry.evm ? "yes" : "no"} solana=${entry.solana ? "yes" : "no"}`
      );
      return { known: true, entry };
    }
  }
  console.log(`[migrate] lookup: no match for [${tried.map(tag).join(", ")}] in ${rows.size} rows`);
  return { known: false, entry: null };
}

/** Test seam: forget what was loaded. */
export function resetLegacyDirectory(): void {
  table = null;
  loadedAt = 0;
  loading = null;
}
