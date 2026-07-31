import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { forgetSponsor, resolveSponsorId } from "@/lib/earn/sponsor-identity";

// Server-side proxy for the earn service (bounty listings, sponsors,
// submissions). Same arrangement as the casino proxy: the service sends no
// CORS headers, and routing through our origin keeps the service key out of
// the browser.
//
// The earn service does no token verification of its own. It acts on whatever
// `x-user-id` and `x-sponsor-id` it is handed, so this file is the trust
// boundary. Every outbound header set is built from scratch below, which is
// what stops a browser-supplied identity header from being passed through.
const BASE = process.env.EARN_API_URL;
const SERVICE_KEY = process.env.EARN_API_KEY;

// Short cache so concurrent polls for the same path collapse into one upstream
// call. Only applied to public GETs; per-caller reads are never cached.
const CACHE_TTL_MS = 3000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

// Endpoints a signed-out visitor may read: the browse feed and the name and
// slug availability checks the sign-up form calls before there is an account.
const PUBLIC_READ_PREFIXES = [
  "health",
  "listings",
  "sponsors/check-name",
  "sponsors/check-slug",
] as const;

// Everything under here acts on behalf of a company rather than a person, so
// it needs the caller's sponsor resolved before it can be forwarded.
const SPONSOR_PREFIX = "sponsor-dashboard/";

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

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have a sponsor account yet." },
    },
    { status: 403 }
  );
}

function upstreamError() {
  return NextResponse.json(
    { success: false, error: { code: "UPSTREAM_ERROR", message: "Earn is unreachable." } },
    { status: 502 }
  );
}

function clientIpOf(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

function serviceHeaders(userId: string | null): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (SERVICE_KEY) headers.authorization = `Bearer ${SERVICE_KEY}`;
  if (userId) headers["x-user-id"] = userId;
  return headers;
}

// Asks the earn service which sponsor this user owns. Returns null both when
// the user has no sponsor and when the lookup fails, so a broken lookup denies
// the action rather than letting it through unscoped.
async function fetchSponsorId(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/sponsors`, {
      headers: serviceHeaders(userId),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success !== true) return null;
    const id = body.data?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch (error) {
    console.error("Earn sponsor lookup failed:", userId, error);
    return null;
  }
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST",
  userId: string | null,
  sponsorId: string | null,
  body?: string
) {
  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers = serviceHeaders(userId);
  if (method === "POST") headers["content-type"] = "application/json";
  // Resolved from the caller's session upstream, never read off the request.
  if (sponsorId) headers["x-sponsor-id"] = sponsorId;
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
    console.error("Earn proxy failed:", joined, error);
    return upstreamError();
  }
}

// Resolves the sponsor when the path needs one. Returns the id, or a response
// to send back instead when the caller has no sponsor to act as.
async function sponsorFor(
  joined: string,
  userId: string
): Promise<{ sponsorId: string | null; deny?: NextResponse }> {
  if (!joined.startsWith(SPONSOR_PREFIX)) return { sponsorId: null };
  const sponsorId = await resolveSponsorId(userId, fetchSponsorId);
  if (!sponsorId) return { sponsorId: null, deny: forbidden() };
  return { sponsorId };
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

  const userId = claims?.userId ?? null;
  if (userId) {
    const { sponsorId, deny } = await sponsorFor(joined, userId);
    if (deny) return deny;
    return forward(req, joined, "GET", userId, sponsorId);
  }

  return forward(req, joined, "GET", null, null);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();

  // Every write here creates or changes a record owned by a person or a
  // company, so all of them need a verified session.
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();

  const joined = path.join("/");
  const { sponsorId, deny } = await sponsorFor(joined, claims.userId);
  if (deny) return deny;

  const body = await req.text();
  const res = await forward(req, joined, "POST", claims.userId, sponsorId, body || undefined);

  // Creating a sponsor changes the answer this proxy caches, and the very next
  // request the UI makes is a sponsor-scoped one. Drop the cached "no sponsor"
  // so the dashboard works immediately rather than after the TTL.
  if (joined === "sponsors/create" && res.ok) forgetSponsor(claims.userId);

  return res;
}
