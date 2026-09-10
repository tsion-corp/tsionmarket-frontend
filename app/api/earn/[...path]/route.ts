import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the earn service (bounty listings, companies,
// submissions). The gateway sends no CORS headers, so routing through our own
// origin is what makes the service reachable from the browser at all.
//
// Earn verifies Privy access tokens itself and resolves the DID to its own User
// row. It ignores client-supplied identity headers entirely, so this proxy's
// only job on an authenticated call is to pass the caller's token through
// unchanged. It used to inject `x-user-id` and resolve `x-sponsor-id`
// server-side; both are dead weight now that the service does its own auth.
// Override for a local earn service; unset, the shared gateway serves it.
const BASE = process.env.EARN_API_URL ?? wsapiService("earn");

// Short cache so concurrent polls for the same path collapse into one upstream
// call. Only applied to public GETs; anything carrying a token is per-caller
// and never cached.
const CACHE_TTL_MS = 3000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

// Endpoints a signed-out visitor may read: the browse feed and the name and
// slug availability checks the sign-up form calls before there is an account.
const PUBLIC_READ_PREFIXES = [
  "health",
  "listings",
  "sponsors/check-name",
  "sponsors/check-slug",
  // The VAPID public key is exactly that, and the browser needs it before it
  // can subscribe. Nothing about it identifies a caller.
  "notifications/vapid-key",
] as const;

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Earn isn't configured yet." },
    },
    { status: 503 }
  );
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
    { status: 401 }
  );
}

// The caller's raw Privy access token, which is what earn verifies. Read from
// the same two places the rest of the app puts it.
function accessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return req.cookies.get("privy-token")?.value ?? null;
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
  token: string | null,
  body?: string
) {
  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  // Earn resolves the user, their roles and their company from this token
  // alone. Nothing else here names the caller.
  if (token) headers.authorization = `Bearer ${token}`;
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
    // Only anonymous reads are cached; a response shaped by somebody's token
    // must never be served to anybody else.
    if (method === "GET" && !token) {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body: text, status: res.status });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Earn proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Earn is unreachable." } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();
  const joined = path.join("/");

  const isPublic = PUBLIC_READ_PREFIXES.some((p) => joined.startsWith(p));
  const token = accessToken(req);

  if (!isPublic) {
    // Checked here as well as upstream so an expired session fails with our own
    // message rather than a bare 401 from a service the user has never heard of.
    if (!(await verifyRequest(req))) return unauthorized();
    return forward(req, joined, "GET", token);
  }

  // A public path read by a signed-in caller still goes through with the token,
  // since the feed can be personalised; that response is not cached.
  if (!token) {
    const url = `${BASE}/${joined}${req.nextUrl.search}`;
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return forward(req, joined, "GET", token);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();

  // Every write creates or changes a record owned by a person or a company, so
  // all of them need a session we can vouch for before we spend a round trip.
  if (!(await verifyRequest(req))) return unauthorized();

  const token = accessToken(req);
  const body = await req.text();
  return forward(req, path.join("/"), "POST", token, body || undefined);
}
