import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the ramping service (NGN on/offramps over the
// Difference rail). Every request is session-verified: creating an order opens
// a payment channel, and even the reads reveal order state. Only the routes a
// user's own flow needs are proxied. The list endpoints are deliberately NOT
// here: GET /onramps and /offramps enumerate every order on the platform, and
// /balances and PATCH /rates are operator surfaces.
const BASE = process.env.RAMPING_API_URL ?? wsapiService("ramping");

// Order ids are cuid-like; bank uuids never appear in a path.
const ALLOWED: Array<{ method: "GET" | "POST"; pattern: RegExp }> = [
  { method: "POST", pattern: /^onramps$/ },
  { method: "GET", pattern: /^onramps\/[A-Za-z0-9_-]+$/ },
  { method: "POST", pattern: /^offramps$/ },
  { method: "GET", pattern: /^offramps\/[A-Za-z0-9_-]+$/ },
  { method: "GET", pattern: /^rates$/ },
  { method: "GET", pattern: /^banks$/ },
  { method: "POST", pattern: /^banks\/resolve$/ },
];

function isAllowedRampingPath(method: "GET" | "POST", path: string): boolean {
  return ALLOWED.some((rule) => rule.method === method && rule.pattern.test(path));
}

// The bank list moves rarely and rates move on the operator's schedule; a
// short shared cache collapses every user's reads into one upstream call.
// Orders are money in flight and are never cached.
function revalidateFor(path: string): number | undefined {
  if (path === "banks") return 600;
  if (path === "rates") return 60;
  return undefined;
}

async function proxy(req: NextRequest, path: string[], method: "GET" | "POST", body?: unknown) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sign in first." } },
      { status: 401 }
    );
  }

  const joined = path.join("/");
  if (!isAllowedRampingPath(method, joined)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  const headers: Record<string, string> = {};
  if (body != null) headers["content-type"] = "application/json";
  // The ramping service verifies the caller itself and binds an onramp's
  // destination to the caller's own wallet, so the signed Privy identity token
  // MUST reach it: without this the service (correctly) refuses every request.
  const idToken = req.headers.get("privy-id-token");
  if (idToken) headers["privy-id-token"] = idToken;
  const authorization = req.headers.get("authorization");
  if (authorization) headers["authorization"] = authorization;
  // The create routes are idempotent on this key; the client generates it and
  // reuses it verbatim on retry, so a retried request replays the original
  // order instead of opening a second payment channel.
  const idempotency = req.headers.get("x-idempotency-key");
  if (idempotency) headers["x-idempotency-key"] = idempotency;

  const revalidate = method === "GET" ? revalidateFor(joined) : undefined;
  try {
    const res = await fetch(`${BASE}/${joined}${req.nextUrl.search}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
      ...(revalidate != null ? { next: { revalidate } } : { cache: "no-store" }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Ramping proxy failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Ramping unreachable" } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = await req.json().catch(() => undefined);
  return proxy(req, path, "POST", body);
}
