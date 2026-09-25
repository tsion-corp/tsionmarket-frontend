import { NextResponse, type NextRequest } from "next/server";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { tradeSchemaFor } from "@/lib/api/schemas/trade";
import { wsapiService } from "@/lib/wsapi-base";
import { isSafeProxyPath } from "@/lib/server/proxy-path";

// Proxy for the Base token-trading service (memecoins). The gateway sends no
// CORS headers, so browser calls route through our origin like every other
// service. Unlike the chess proxy this one injects no identity: the trade
// backend verifies the forwarded Privy access token itself, so Authorization
// and Idempotency-Key pass through untouched.
const BASE = process.env.NEXT_PUBLIC_TRADE_API_URL ?? wsapiService("trade");
const NO_STORE = "no-store, max-age=0, must-revalidate";

// Public token reads only; authed reads (swaps, balances) are per-caller and
// must never be shared. Short, to collapse concurrent list polls.
const CACHE_TTL_MS = 2_000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

function cacheable(joined: string, hasAuth: boolean): boolean {
  return !hasAuth && joined.startsWith("tokens");
}

// A non-JSON body (an upstream error page) is passed through untouched rather
// than turned into a validation failure.
function safeJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The service's failure envelope carries a requestId, and the contract says
// to preserve it in client logs and support reports. The relay's OWN failures
// (nothing upstream answered, or what answered was not understood) mint one
// too, so a support screenshot always has a reference whichever side failed.
// The id is also echoed as a header so the one transport (lib/api.ts) can tag
// its Watchtower report without consuming the body.
const REQUEST_ID_HEADER = "x-request-id";

function relayError(code: string, message: string, status: number) {
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    { success: false, error: { code, message, details: null, requestId } },
    { status, headers: { "cache-control": NO_STORE, [REQUEST_ID_HEADER]: requestId } }
  );
}

// The requestId inside an upstream failure envelope, if it carried one.
function upstreamRequestId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const error = (parsed as { error?: { requestId?: unknown } }).error;
  return typeof error?.requestId === "string" ? error.requestId : null;
}

function notConfigured() {
  return relayError("NOT_CONFIGURED", "Trading isn't configured yet.", 503);
}

async function forward(req: NextRequest, method: "GET" | "POST") {
  if (!BASE) return notConfigured();
  const { pathname, search } = req.nextUrl;
  if (!pathname.startsWith("/api/trade/")) {
    return relayError("BAD_REQUEST", "Invalid path", 400);
  }
  const joined = pathname.replace(/^\/api\/trade\//, "");
  if (!isSafeProxyPath(joined)) {
    return relayError("BAD_REQUEST", "Invalid path", 400);
  }
  // The admin surface is out of contract for this frontend.
  if (joined.startsWith("admin")) {
    return relayError("NOT_FOUND", "Not found", 404);
  }

  const auth = req.headers.get("authorization");
  // The client sends the key twice (canonical + x-fallback) because browser
  // privacy extensions can strip nonstandard headers; upstream always gets
  // the canonical form.
  const idempotency = req.headers.get("idempotency-key") ?? req.headers.get("x-idem-key");
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
    const schema = tradeSchemaFor(joined);
    // Parsed for validation on a schema'd route, and on any failure for the
    // requestId the service put in its envelope.
    const parsed = schema || !res.ok ? safeJson(text) : null;
    if (schema && parsed !== null) {
      const check = checkUpstream(schema, parsed, { service: "trade", path: joined });
      if (!check.ok) {
        console.error(check.problem);
        return relayError("BAD_RESPONSE", "Trading response was not understood.", 502);
      }
    }
    // Only a successful read is cached. A 502 PROVIDER_ERROR is temporary and
    // the client retries it with backoff; caching it would hand that retry the
    // same failure, and a 404 must not become a remembered "missing mint".
    if (method === "GET" && res.ok && cacheable(joined, !!auth)) {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, body: text, status: res.status });
    }
    const responseHeaders: Record<string, string> = {
      "content-type": "application/json",
      "cache-control": NO_STORE,
    };
    const requestId = res.ok ? null : upstreamRequestId(parsed);
    if (requestId) responseHeaders[REQUEST_ID_HEADER] = requestId;
    // Retry-After has to survive the relay or a 429 loses the only thing that
    // says when to come back. The catalogue walk reads it to schedule its next
    // page; without it the client falls back to a fixed backoff and either
    // waits longer than the gateway asked or returns too soon and is refused
    // again. Copied only when upstream sent one, so nothing is invented.
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) responseHeaders["retry-after"] = retryAfter;
    return new NextResponse(text, { status: res.status, headers: responseHeaders });
  } catch (error) {
    console.error("Trade proxy failed:", joined, error);
    return relayError("SERVICE_UNAVAILABLE", "Trading is unreachable.", 502);
  }
}

export async function GET(req: NextRequest) {
  return forward(req, "GET");
}

export async function POST(req: NextRequest) {
  return forward(req, "POST");
}
