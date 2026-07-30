import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Server-side proxy for the casino gateway (chess, draw, spectator betting).
// Same arrangement as the vault proxy: the gateway sends no CORS headers, and
// routing through our origin keeps every external API in this app proxied.
//
// Reads are public and briefly cached. Writes stake real money, so they
// require a verified Privy session and are forwarded with the caller's user id
// and originating IP, never a service key held in the browser.
const BASE = process.env.NEXT_PUBLIC_CASINO_API_URL;
const SERVICE_KEY = process.env.CASINO_API_KEY;

// Short cache so concurrent polls for the same path collapse into one upstream
// call. Only applied to GETs; writes are never cached.
const CACHE_TTL_MS = 3000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

// Endpoints a signed-out visitor may read. Everything else needs a session,
// including "my bets" and "my entries", which are per-caller.
const PUBLIC_READ_PREFIXES = [
  "hub/",
  "chess/challenges",
  "chess/matches",
  "chess/invites/",
  "betting/markets/",
  "draw/rounds/",
  "draw/results",
];

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "The casino isn't configured yet." },
    },
    { status: 503 }
  );
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to play." } },
    { status: 401 }
  );
}

function clientIpOf(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST",
  userId: string | null,
  body?: string
) {
  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  if (SERVICE_KEY) headers.authorization = `Bearer ${SERVICE_KEY}`;
  // The gateway authorises the action against this id, and rate-limits per
  // user rather than lumping everyone behind this server's address.
  if (userId) headers["x-user-id"] = userId;
  const ip = clientIpOf(req);
  if (ip) headers["x-forwarded-for"] = ip;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (method === "GET") {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body: text, status: res.status });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Casino proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "The casino is unreachable." } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();
  const joined = path.join("/");

  const isPublic = PUBLIC_READ_PREFIXES.some((p) => joined.startsWith(p));
  const claims = await verifyRequest(req);
  if (!isPublic && !claims) return unauthorized();

  // Only shared public reads are cached; per-caller reads never are.
  if (isPublic) {
    const url = `${BASE}/${joined}${req.nextUrl.search}`;
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return forward(req, joined, "GET", claims?.userId ?? null);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();

  // Every write moves money, so all of them require a verified session.
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();

  const body = await req.text();
  return forward(req, path.join("/"), "POST", claims.userId, body || undefined);
}
