import { NextResponse, type NextRequest } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";

// Proxy for the prediction-market read + metadata service. The gateway sends no
// CORS headers, so browser calls route through our origin like every other
// service. The service is keyless: reads are public and the write endpoints
// (metadata, image) only attach off-chain data, so we forward Authorization and
// the idempotency key untouched and inject no identity of our own.
// Override for a local prediction service; unset, the shared gateway serves it.
const BASE = process.env.NEXT_PUBLIC_PREDICTION_API_URL ?? wsapiService("prediction-market");
const NO_STORE = "no-store, max-age=0, must-revalidate";

// Public market/category reads only. Short TTL to collapse concurrent list
// polls; authed or wallet-scoped reads are never shared.
const CACHE_TTL_MS = 2_000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

function cacheable(joined: string, hasAuth: boolean, hasQuery: boolean): boolean {
  if (hasAuth) return false;
  // markets list/detail/chart/trades and categories are public; wallet-scoped
  // reads (positions, lp) carry a ?wallet= query and must not be cached.
  if (joined === "categories") return true;
  return joined.startsWith("markets") && !joined.includes("wallet") && !hasQuery;
}

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Prediction markets aren't configured yet." },
    },
    { status: 503, headers: { "cache-control": NO_STORE } }
  );
}

async function forward(req: NextRequest, method: "GET" | "POST") {
  if (!BASE) return notConfigured();
  const { pathname, search } = req.nextUrl;
  const joined = pathname.replace(/^\/api\/prediction\//, "");

  const auth = req.headers.get("authorization");
  // The client sends the idempotency key twice (canonical + x-fallback) because
  // browser privacy extensions can strip nonstandard headers; upstream always
  // gets the canonical form.
  const idempotency = req.headers.get("idempotency-key") ?? req.headers.get("x-idem-key");
  const url = `${BASE}/${joined}${search}`;

  if (method === "GET" && cacheable(joined, !!auth, search !== "")) {
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
      // Image uploads can be a few MiB and take longer than a JSON read.
      signal: AbortSignal.timeout(method === "POST" ? 30_000 : 15_000),
    });
    const text = await res.text();
    if (method === "GET" && res.ok && cacheable(joined, !!auth, search !== "")) {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body: text, status: res.status });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": NO_STORE },
    });
  } catch (error) {
    console.error("Prediction proxy failed:", joined, error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Prediction markets are unreachable." },
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
