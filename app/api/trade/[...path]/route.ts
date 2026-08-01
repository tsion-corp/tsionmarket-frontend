import { NextResponse, type NextRequest } from "next/server";

// Proxy for the Base token-trading service (memecoins). The gateway sends no
// CORS headers, so browser calls route through our origin like every other
// service. Unlike the chess proxy this one injects no identity: the trade
// backend verifies the forwarded Privy access token itself, so Authorization
// and Idempotency-Key pass through untouched.
const BASE = process.env.NEXT_PUBLIC_TRADE_API_URL;
const NO_STORE = "no-store, max-age=0, must-revalidate";

// Public token reads only; authed reads (swaps, balances) are per-caller and
// must never be shared. Short, to collapse concurrent list polls.
const CACHE_TTL_MS = 2_000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

function cacheable(joined: string, hasAuth: boolean): boolean {
  return !hasAuth && joined.startsWith("tokens");
}

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Trading isn't configured yet." },
    },
    { status: 503, headers: { "cache-control": NO_STORE } }
  );
}

async function forward(req: NextRequest, method: "GET" | "POST") {
  if (!BASE) return notConfigured();
  const { pathname, search } = req.nextUrl;
  const joined = pathname.replace(/^\/api\/trade\//, "");
  // The admin surface is out of contract for this frontend.
  if (joined.startsWith("admin")) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404, headers: { "cache-control": NO_STORE } }
    );
  }

  const auth = req.headers.get("authorization");
  const url = `${BASE}/${joined}${search}`;

  if (method === "GET" && cacheable(joined, !!auth)) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": "application/json", "cache-control": NO_STORE },
      });
    }
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (auth) headers.authorization = auth;
  const idempotency = req.headers.get("idempotency-key");
  if (idempotency) headers["idempotency-key"] = idempotency;
  let body: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    body = await req.text();
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (method === "GET" && cacheable(joined, !!auth)) {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body: text, status: res.status });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": NO_STORE },
    });
  } catch (error) {
    console.error("Trade proxy failed:", joined, error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Trading is unreachable." },
      },
      { status: 502, headers: { "cache-control": NO_STORE } }
    );
  }
}

export async function GET(req: NextRequest) {
  return forward(req, "GET");
}

export async function POST(req: NextRequest) {
  return forward(req, "POST");
}
