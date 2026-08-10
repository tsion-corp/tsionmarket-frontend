import { NextResponse, type NextRequest } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";
import { wsapiService } from "@/lib/wsapi-base";

// Waitlist sign-ups from the pre-launch page, forwarded to the platform's own
// waitlist store (owned by the perp service, which is where marketing signups
// live). Derived from the gateway base like every other service, so there is no
// waitlist-specific env var to set.
//
// Public by design — the whole point is that nobody is signed in yet.
//
// The service is idempotent per email: a repeat address answers 200 with
// alreadyJoined instead of an error, and that distinction is passed through so
// the page can say "you're already on the list" rather than claiming a fresh
// signup.

const UPSTREAM = `${wsapiService("perp")}/waitlist`;
const UPSTREAM_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = (body as { email?: unknown } | null)?.email;
  if (typeof raw !== "string" || !isValidEmail(raw)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeEmail(raw);

  try {
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `source` tags where a signup came from, so the same list can serve
      // other surfaces later without the entries becoming ambiguous.
      body: JSON.stringify({ email, source: "waitlist-page" }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    const envelope = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { alreadyJoined?: boolean };
    } | null;
    if (!res.ok || !envelope?.success) {
      console.error("Waitlist service rejected a signup:", res.status, envelope);
      return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, alreadyJoined: envelope.data?.alreadyJoined === true });
  } catch (error) {
    console.error("Waitlist service unreachable:", error);
    return NextResponse.json({ error: "Couldn't save that right now." }, { status: 502 });
  }
}
