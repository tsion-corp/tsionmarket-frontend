import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { getRequestUser, verifyRequest } from "@/lib/server/auth";
import { getPrivyClient } from "@/lib/server/privy";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";
import { wsapiService } from "@/lib/wsapi-base";

// The record of what a person agreed to on the sign in page: the Terms of
// Service and Privacy Policy, and whether they want product email.
//
// The record lives on the account itself, as custom metadata on the Privy
// user. That is the store every other service already reads users from, so
// the user-management service that sends campaigns can filter on
// `marketing_opt_in` without a new table, and a terms acceptance is tied to
// the account rather than to a browser. A marketing yes is also passed to
// the platform's subscriber list so the address is there for campaigns that
// read that list instead.
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
  const user = await getRequestUser(req, claims);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const meta = user.custom_metadata ?? {};
  return NextResponse.json({
    termsVersion: meta[CONSENT_KEYS.termsVersion] ?? null,
    termsAcceptedAt: meta[CONSENT_KEYS.termsAcceptedAt] ?? null,
    marketing: meta[CONSENT_KEYS.marketingOptIn] === true,
  });
}
