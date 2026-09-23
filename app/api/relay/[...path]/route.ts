import { NextResponse, type NextRequest } from "next/server";
import { MIXPANEL_INGEST_HOST, endpointForRoute } from "@/lib/analytics/relay";
import { clientPublicIp } from "@/lib/server/ipinfo";
import { batchTokens } from "@/lib/server/mixpanel-relay";

// The browser's Mixpanel batches come through here instead of going straight
// to Mixpanel. Ad blockers drop requests to Mixpanel's hosts, and a share of
// this app's users (Brave, uBlock) were invisible because of it. See
// lib/analytics/relay.ts for the routes, and app/api/monitoring for the same
// arrangement for Watchtower.
//
// This is a forwarder, not a general proxy. It only ever calls Mixpanel's
// ingestion host, only for the three endpoints the SDK needs, and only for
// batches whose every item carries this project's token.

// Mixpanel refuses a batch over 2 MB, and the SDK sends 50 events at most.
// Refused here too, before it costs an upstream round trip.
const MAX_BYTES = 2_000_000;
// A slow Mixpanel must not hold a function open. The SDK retries a failure.
const UPSTREAM_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  // Analytics not configured (local development). Accept and discard, so the
  // client is not left retrying a route that will never work.
  if (!token) return new NextResponse(null, { status: 204 });

  const { path } = await ctx.params;
  const endpoint = path.length === 1 ? endpointForRoute(path[0]) : null;
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const tokens = batchTokens(body);
  if (!tokens) return NextResponse.json({ error: "Malformed batch" }, { status: 400 });
  if (tokens.some((t) => t !== token)) {
    // The check that keeps this from being an open relay into any project.
    return NextResponse.json({ error: "Batch is not for this project" }, { status: 403 });
  }

  const headers = new Headers({
    "Content-Type": req.headers.get("content-type") ?? "application/x-www-form-urlencoded",
  });
  // Mixpanel geolocates by the request's IP. Without these every visitor would
  // be placed wherever this function runs.
  const ip = clientPublicIp(req.headers);
  if (ip) {
    headers.set("X-Forwarded-For", ip);
    headers.set("X-Real-IP", ip);
  }

  const upstreamUrl = `${MIXPANEL_INGEST_HOST}/${endpoint}/${req.nextUrl.search}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await upstream.text();
    // A refused batch is the failure that hides best: the dashboard just stays
    // short. Say why in the server log. Rate limiting is routine, not noise.
    if (!upstream.ok && upstream.status !== 429) {
      console.error(
        `Mixpanel refused a ${endpoint} batch: HTTP ${upstream.status} ${text.slice(0, 500)}`
      );
    }
    // Status and body pass straight back: the SDK reads both to decide whether
    // to retry, and a 429 has to reach it or it keeps sending.
    const out = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
    });
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) out.set("retry-after", retryAfter);
    return new NextResponse(text, { status: upstream.status, headers: out });
  } catch (error) {
    console.error("Mixpanel relay forward failed:", error);
    return new NextResponse(null, { status: 502 });
  }
}
