import { NextResponse, type NextRequest } from "next/server";

// Server-side proxy for the world-street-vault game API. The gateway does not
// send CORS headers today, so a direct browser fetch is blocked even though
// the endpoint returns 200. Routing through our own origin sidesteps CORS and
// keeps the vault consistent with every other external API in this app, which
// is also proxied. Read-only: only game/* GETs are forwarded.
const BASE = process.env.NEXT_PUBLIC_VAULT_API_URL;

// The gateway rate-limits ~100 requests/min per IP, and every user's polls now
// share this server's IP. A short cache collapses concurrent/near-simultaneous
// requests for the same path into one upstream call so we stay well under it.
const CACHE_TTL_MS = 4000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Vault isn't configured" } },
      { status: 503 }
    );
  }

  const joined = path.join("/");
  // Only the public read endpoints are proxied.
  if (!joined.startsWith("game/")) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) {
    return new NextResponse(hit.body, {
      status: hit.status,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body, status: res.status });
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Vault proxy failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Vault request failed" } },
      { status: 502 }
    );
  }
}
