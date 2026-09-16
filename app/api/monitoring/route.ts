import { NextResponse, type NextRequest } from "next/server";
import { watchtowerIngestUrl, watchtowerPublicKey } from "@/lib/analytics/watchtower";

// The browser's error reports go through here instead of straight to
// Watchtower. Two reasons, and the first is the one that forced it.
//
// 1. Ad blockers drop the direct request. Watchtower's ingest path is Sentry's
//    well-known shape (/api/<id>/envelope/?sentry_key=...), and blocker filter
//    lists match that shape on ANY host, not just sentry.io. Measured here:
//    from a Brave tab, a POST carrying `sentry_key` never leaves the browser
//    ("Failed to fetch"), while the same request from Node succeeds with
//    `{"events":1,"dropped":0}`. CORS is not the problem; Watchtower answers
//    the preflight correctly with `Access-Control-Allow-Origin: *`. Without
//    this route, every Brave and uBlock user is invisible, which is a
//    meaningful share of the people whose errors we most want to see.
// 2. `app/api/` is where this codebase puts upstream calls anyway, so the
//    browser holds a same-origin path and no third-party base URL.
//
// Sentry's own `tunnelRoute` build option is NOT usable for this: the rewrite
// it generates ignores a custom `sentryUrl` and is hardcoded to sentry.io. See
// the comment in next.config.ts.
//
// This is a forwarder, not a general proxy. It only ever talks to Watchtower,
// and it refuses anything that is not an envelope for this project's key, so
// it cannot be used to relay traffic somewhere else.

// Watchtower documents a 1 MB payload limit. Enforced here too so an oversized
// body is refused before it costs an upstream round trip.
const MAX_BYTES = 1_000_000;

export async function POST(req: NextRequest) {
  const ingestUrl = watchtowerIngestUrl();
  // Reporting not configured (local development). Accept and discard, so the
  // client is not left retrying a route that will never work.
  if (!ingestUrl) return new NextResponse(null, { status: 204 });

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // An envelope is newline-delimited JSON whose first line is the header. The
  // header names the DSN the client was configured with; anything else is not
  // ours to forward.
  const header = body.slice(0, body.indexOf("\n"));
  let dsn: string | undefined;
  try {
    dsn = (JSON.parse(header) as { dsn?: string }).dsn;
  } catch {
    return NextResponse.json({ error: "Malformed envelope" }, { status: 400 });
  }

  const key = watchtowerPublicKey();
  if (!dsn || !key || !dsn.includes(key)) {
    // The check that keeps this from being an open relay: without it, anyone
    // could POST here and have our server forward it under our project.
    return NextResponse.json({ error: "Envelope is not for this project" }, { status: 403 });
  }

  try {
    const upstream = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
    });
    // When Watchtower refuses an event, say why in the server log. A silent
    // rejection here is the worst failure this integration can have: the SDK
    // reports success, the dashboard stays empty, and nothing anywhere
    // explains it. Rate limiting is expected and routine, so it is not noise.
    if (!upstream.ok && upstream.status !== 429) {
      const detail = await upstream.clone().text();
      console.error(
        `Watchtower rejected an event: HTTP ${upstream.status} ${detail.slice(0, 500)}`
      );
    }
    // Pass the status straight back so the SDK's own rate-limit handling still
    // works: a 429 here has to reach the client, or it keeps sending.
    return new NextResponse(null, {
      status: upstream.status,
      headers: upstream.headers.has("retry-after")
        ? { "retry-after": upstream.headers.get("retry-after")! }
        : undefined,
    });
  } catch (error) {
    // Telemetry failing must never be loud. Logged server-side, and the client
    // is told to stop rather than retry into a dead upstream.
    console.error("Watchtower forward failed:", error);
    return new NextResponse(null, { status: 502 });
  }
}
