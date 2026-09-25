import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { extractAccessToken, getRequestUser, verifyRequest } from "@/lib/server/auth";
import {
  DecanePreferencesError,
  readDecanePreferences,
  updateDecanePreferences,
} from "@/lib/server/decane";
import { getPrivyClient } from "@/lib/server/privy";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";
import { wsapiService } from "@/lib/wsapi-base";

// The record of what a person agreed to on the sign in page: the Terms of
// Service and Privacy Policy, and whether they want product email.
//
// The record lives on the account itself: in the user's preferences record
// on Decane for a Decane session, written with the caller's own token
// (lib/server/decane.ts), or as custom metadata on the Privy user for a
// session from the migration window. Either way a terms acceptance is tied
// to the account rather than to a browser. A marketing yes is also passed to
// the platform's subscriber list so the address is there for campaigns that
// read that list — for a Privy session only: Decane keeps no email (the
// backend holds an HMAC and a masked identifier), so a Decane account's yes
// is recorded and nothing is subscribed here.
//
// Only the signed in user can write their own record, and only these fields:
// the route sets the keys itself from a validated body, so nothing a client
// sends can land in the account's metadata verbatim.

const WAITLIST_UPSTREAM = `${wsapiService("perp")}/waitlist`;
const UPSTREAM_TIMEOUT_MS = 10_000;

// The keys this route owns in the user's custom metadata. Not exported: a
// route file may only export its handlers.
const CONSENT_KEYS = {
  termsVersion: "terms_version",
  termsAcceptedAt: "terms_accepted_at",
  marketingOptIn: "marketing_opt_in",
  consentUpdatedAt: "consent_updated_at",
} as const;

interface ConsentBody {
  terms: true;
  termsVersion: string;
  acceptedAt: string;
  marketing: boolean;
}

const VERSION = /^\d{4}-\d{2}-\d{2}$/;

function parseBody(body: unknown): ConsentBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.terms !== true) return null;
  if (typeof b.termsVersion !== "string" || !VERSION.test(b.termsVersion)) return null;
  if (typeof b.acceptedAt !== "string" || Number.isNaN(Date.parse(b.acceptedAt))) return null;
  if (typeof b.marketing !== "boolean") return null;
  return {
    terms: true,
    termsVersion: b.termsVersion,
    acceptedAt: new Date(b.acceptedAt).toISOString(),
    marketing: b.marketing,
  };
}

// The address campaigns would go to: the one they signed in with, or the one
// their Google account carries. A passkey or X only account has none, and
// then the opt in is recorded on the account and nothing is subscribed.
function accountEmail(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === "email" && isValidEmail(account.address)) {
      return normalizeEmail(account.address);
    }
    if (account.type === "google_oauth" && isValidEmail(account.email)) {
      return normalizeEmail(account.email);
    }
  }
  return null;
}

async function subscribe(email: string): Promise<void> {
  try {
    const res = await fetch(WAITLIST_UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "auth-optin" }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) console.error("[consent] subscriber list rejected an opt in:", res.status);
  } catch (error) {
    console.error("[consent] subscriber list unreachable:", error);
  }
}

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid consent record." }, { status: 400 });

  if (claims.provider === "decane") {
    const token = extractAccessToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      await updateDecanePreferences(token, {
        [CONSENT_KEYS.termsVersion]: body.termsVersion,
        [CONSENT_KEYS.termsAcceptedAt]: body.acceptedAt,
        [CONSENT_KEYS.marketingOptIn]: body.marketing,
        [CONSENT_KEYS.consentUpdatedAt]: new Date().toISOString(),
      });
    } catch (error) {
      return decaneFailure("record on", error);
    }
    return NextResponse.json({
      ok: true,
      termsVersion: body.termsVersion,
      termsAcceptedAt: body.acceptedAt,
      marketing: body.marketing,
      subscribed: false,
    });
  }

  const user = await getRequestUser(req, claims);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();
  try {
    await getPrivyClient()
      .users()
      .setCustomMetadata(user.id, {
        // Set replaces the whole object, so whatever else lives there is
        // carried over untouched.
        custom_metadata: {
          ...(user.custom_metadata ?? {}),
          [CONSENT_KEYS.termsVersion]: body.termsVersion,
          [CONSENT_KEYS.termsAcceptedAt]: body.acceptedAt,
          [CONSENT_KEYS.marketingOptIn]: body.marketing,
          [CONSENT_KEYS.consentUpdatedAt]: now,
        },
      });
  } catch (error) {
    console.error("[consent] could not record on the account:", error);
    return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
  }

  // Best effort, after the record is safe: the list is a convenience for
  // campaigns, the account is the truth.
  const email = body.marketing ? accountEmail(user) : null;
  if (email) await subscribe(email);

  return NextResponse.json({
    ok: true,
    termsVersion: body.termsVersion,
    termsAcceptedAt: body.acceptedAt,
    marketing: body.marketing,
    subscribed: email !== null,
  });
}

// What the account has on record, for a client that wants to show it.
export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let meta: Record<string, unknown>;
  if (claims.provider === "decane") {
    const token = extractAccessToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      meta = await readDecanePreferences(token);
    } catch (error) {
      return decaneFailure("read from", error);
    }
  } else {
    const user = await getRequestUser(req, claims);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    meta = user.custom_metadata ?? {};
  }
  return NextResponse.json({
    termsVersion: meta[CONSENT_KEYS.termsVersion] ?? null,
    termsAcceptedAt: meta[CONSENT_KEYS.termsAcceptedAt] ?? null,
    marketing: meta[CONSENT_KEYS.marketingOptIn] === true,
  });
}

// A token Decane no longer accepts is the caller's problem to fix by signing
// in again, and is answered as such; anything else is the store being down.
function decaneFailure(verb: string, error: unknown) {
  if (error instanceof DecanePreferencesError && error.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(`[consent] could not ${verb} the account:`, error);
  return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
}
