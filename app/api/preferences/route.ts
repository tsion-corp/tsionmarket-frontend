import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { extractAccessToken, getRequestUser, verifyRequest } from "@/lib/server/auth";
import {
  DecanePreferencesError,
  readDecanePreferences,
  updateDecanePreferences,
} from "@/lib/server/decane";
import { getPrivyClient } from "@/lib/server/privy";

// Account-stored product preferences. Today that is Shine: seven independent
// booleans, one per service, deciding whether a confirmed action is posted to
// Market Square on its own.
//
// Modelled on app/api/consent/route.ts, and for the same reason: the record
// belongs to the account, not to a browser. Sign-out clears no preference
// key, so a device-local Shine would mean the next person to sign in on a
// shared laptop inherits the previous person's answer — and has their first
// trade auto-posted publicly on a setting they never saw.
//
// Where the record lives depends on who issued the session. A Decane session
// stores it in the user's preferences record on Decane, written with the
// caller's own token (lib/server/decane.ts); a Privy session, which exists
// only for the migration window, keeps it in Privy custom metadata as before.
// The keys are the same in both (`shine_<service>`), so a record carries over
// unchanged if it is ever copied between the two.
//
// Only the signed in user can write their own record, and only these keys:
// the route sets them itself from a validated body, so nothing a client sends
// can land in the account's metadata verbatim.

// The seven services Shine covers. Deposits and withdrawals are deliberately
// not among them.
//
// The client has one list, in lib/shine/types.ts, which hooks/use-shine.ts
// and the toggle both read. This is deliberately a second copy rather than an
// import of that one: it is the trust boundary, it decides what may be
// written into an account's metadata, and it has to make that decision from
// something no client code can move. Adding a service means changing both —
// which is the point, not the cost — and every name that is not here fails
// closed below.
const SHINE_SERVICES = [
  "memecoin",
  "spot",
  "rwa",
  "prediction",
  "perps",
  "arcade",
  "sports",
] as const;

// The package re-exports User but not the metadata type it carries, so it
// is derived from User rather than restated (and never widened to `any`).
type CustomMetadata = NonNullable<User["custom_metadata"]>;

type ShineService = (typeof SHINE_SERVICES)[number];
type ShinePreferences = Record<ShineService, boolean>;

/**
 * Shine is ON by default, so an account that has never touched it carries no
 * key at all and must read as on. Only an explicit `false` means off — that
 * is the whole difference between "never touched it" and "turned it off",
 * and reading it the other way round would publish for people who opted out.
 *
 * Anything stored under one of these keys that is not a boolean is not a
 * decision anyone made here, so it reads as the default rather than being
 * coerced into one.
 */
const SHINE_DEFAULT = true;

function shineKey(service: ShineService): string {
  return `shine_${service}`;
}

function readShine(metadata: Record<string, unknown>): ShinePreferences {
  const shine = {} as ShinePreferences;
  for (const service of SHINE_SERVICES) {
    const stored = metadata[shineKey(service)];
    shine[service] = typeof stored === "boolean" ? stored : SHINE_DEFAULT;
  }
  return shine;
}

function isShineService(value: string): value is ShineService {
  return (SHINE_SERVICES as readonly string[]).includes(value);
}

/**
 * The body a write takes: `{ shine: { perps: false } }`. One service or
 * several, every value a boolean, every name one of the seven. A body with a
 * key this route does not own is refused rather than partly honoured, so a
 * client cannot reach the rest of the account's metadata through here.
 */
function parseBody(body: unknown): Partial<ShinePreferences> | null {
  if (!body || typeof body !== "object") return null;
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "shine") return null;
  const shine = (body as { shine: unknown }).shine;
  if (!shine || typeof shine !== "object") return null;
  const entries = Object.entries(shine as Record<string, unknown>);
  if (entries.length === 0) return null;
  const parsed: Partial<ShinePreferences> = {};
  for (const [service, value] of entries) {
    if (!isShineService(service)) return null;
    if (typeof value !== "boolean") return null;
    parsed[service] = value;
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shine = parseBody(await req.json().catch(() => null));
  if (!shine) return NextResponse.json({ error: "Invalid preference." }, { status: 400 });

  if (claims.provider === "decane") {
    const token = extractAccessToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const patch: Record<string, boolean> = {};
    for (const service of SHINE_SERVICES) {
      const value = shine[service];
      if (value !== undefined) patch[shineKey(service)] = value;
    }
    try {
      // A merge: the consent keys and the other six Shine keys stay as they are.
      const record = await updateDecanePreferences(token, patch);
      return NextResponse.json({ shine: readShine(record) });
    } catch (error) {
      return decaneFailure("record on", error);
    }
  }

  const user = await getRequestUser(req, claims);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = user.custom_metadata ?? {};
  // Set replaces the whole object, so whatever else lives there — the consent
  // record, the other six Shine keys — is carried over untouched. Dropping
  // this spread wipes what this route did not write.
  const metadata: CustomMetadata = { ...existing };
  for (const service of SHINE_SERVICES) {
    const value = shine[service];
    if (value !== undefined) metadata[shineKey(service)] = value;
  }

  try {
    await getPrivyClient().users().setCustomMetadata(user.id, { custom_metadata: metadata });
  } catch (error) {
    console.error("[preferences] could not record on the account:", error);
    return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
  }

  // The whole resolved record, so a client replaces its copy with what the
  // account now holds rather than with what it guessed it would hold.
  return NextResponse.json({ shine: readShine(metadata) });
}

// What the account has on record. Every service is answered, including the
// ones that were never written: absent means on.
export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (claims.provider === "decane") {
    const token = extractAccessToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      return NextResponse.json({ shine: readShine(await readDecanePreferences(token)) });
    } catch (error) {
      return decaneFailure("read from", error);
    }
  }

  const user = await getRequestUser(req, claims);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ shine: readShine(user.custom_metadata ?? {}) });
}

// A token Decane no longer accepts is the caller's problem to fix by signing
// in again, and is answered as such; anything else is the store being down.
function decaneFailure(verb: string, error: unknown) {
  if (error instanceof DecanePreferencesError && error.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(`[preferences] could not ${verb} the account:`, error);
  return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
}
