import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, verifyRequest } from "@/lib/server/auth";
import { walletOfUser } from "@/lib/server/chess-identity";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the Kash rewards engine (buy KSH, earn on activity,
// vest, convert back to USDC). The gateway sends no CORS headers, so routing
// through our own origin is what makes the service reachable from the browser.
//
// The engine has no auth of its own at MVP: it keys everything on the wallet
// address in the path, query, or body. This proxy is therefore the only gate,
// so it enforces two things on every wallet-scoped call: a verified session,
// and that the named wallet IS the session's own embedded wallet. Without the
// second check any signed-in user could read or move another user's Kash.
// Override for a local engine; unset, the shared gateway serves it.
const BASE = process.env.KASH_API_URL ?? wsapiService("kash");

// Wallet-free reads a signed-out visitor may hit: the engine parameters that
// drive every number in the UI, and the price quotes shown before sign-in.
const PUBLIC_GET_PATHS = new Set([
  "status",
  "purchases/quote",
  "activities/quote",
  "subscriptions/tiers",
  // On-chain desk reads: contract addresses, price, pause state, reserve, and
  // the two quotes. All wallet-free.
  "desk",
  "desk/buy/quote",
  "desk/sell/quote",
]);

// Wallet-free but variable paths: weekly settlement summaries keyed by week,
// and username availability for the referral claim screen.
function isPublicGet(path: string[]): boolean {
  if (PUBLIC_GET_PATHS.has(path.join("/"))) return true;
  if (path[0] === "settlements" && path.length === 2) return true;
  return path[0] === "usernames" && path.length === 3 && path[2] === "available";
}

// Wallet-scoped writes. The demo endpoint (POST /activities) is deliberately
// absent: it mints rewards for free and must never be reachable from the
// public internet, even behind a session.
// `settlements/claim` settles only the named wallet's own points, so it is a
// wallet-scoped write like any other — the ownership check below is what stops
// one user claiming another's. The operator's whole-week `settlements/run` is
// deliberately NOT here: it prices every wallet at once and needs the admin key.
// The desk prepare/tx endpoints return an EIP-712 payload for the named
// wallet to sign and the transaction it submits; binding them to the session
// wallet keeps one user from building payloads against another's nonces.
const WALLET_POST_PATHS = new Set([
  "purchases",
  "subscriptions",
  "settlements/claim",
  "desk/buy/prepare",
  "desk/buy/tx",
  "desk/sell/prepare",
  "desk/sell/tx",
]);

// Short cache so concurrent polls for the same public path collapse into one
// upstream call. Bounded and swept on write so unauthenticated quote spam
// cannot grow it without limit.
const CACHE_TTL_MS = 3000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expires: number; body: string; status: number }>();

function cachePut(url: string, body: string, status: number) {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
  if (cache.size >= CACHE_MAX_ENTRIES) return;
  cache.set(url, { expires: now + CACHE_TTL_MS, body, status });
}

// The wallet a GET path or query names, or null for a path that is not
// wallet-scoped at all (which this proxy then refuses).
function walletOfGet(path: string[], search: URLSearchParams): string | null {
  if (path[0] === "accounts" && path.length >= 2) return path[1];
  if (path[0] === "subscriptions" && path.length === 2) return path[1];
  if (path.join("/") === "purchases") return search.get("wallet");
  return null;
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
      error: { code: "FORBIDDEN", message: "Wallet must be the signed-in wallet." },
    },
    { status: 403 }
  );
}

function notFound() {
  return NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
    { status: 404 }
  );
}

// 401 without a session, 403 when the session does not own `claimed`, null
// when the caller may proceed. Ownership compares the session's embedded EVM
// wallet case-insensitively.
async function walletGate(req: NextRequest, claimed: string | null): Promise<NextResponse | null> {
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();
  if (!claimed) return forbidden();
  const wallet = walletOfUser(await getRequestUser(req, claims));
  if (!wallet || claimed.toLowerCase() !== wallet.toLowerCase()) return forbidden();
  return null;
}

// Referral routes where the engine identifies the caller by verifying the
// Privy identity token itself, so no wallet appears in the request at all.
// The proxy checks for a session and passes the token through; ownership is
// enforced upstream, where the wallet comes out of the verified token.
const IDENTITY_GET_PATHS = new Set(["referrals/me"]);
const IDENTITY_POST_PATHS = new Set(["referrals/claim"]);
const IDENTITY_PUT_PATHS = new Set(["profiles/me/username"]);

function isIdentityPath(joined: string): boolean {
  return (
    IDENTITY_GET_PATHS.has(joined) ||
    IDENTITY_POST_PATHS.has(joined) ||
    IDENTITY_PUT_PATHS.has(joined)
  );
}

// 401 without a session or without the identity token the engine will verify.
async function identityGate(req: NextRequest): Promise<NextResponse | null> {
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();
  if (!req.headers.get("privy-id-token")) return unauthorized();
  return null;
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST" | "PUT",
  body?: string
) {
  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["content-type"] = "application/json";
  // Only identity routes carry the caller's token upstream; everything else
  // keeps the engine request as anonymous as it always was.
  const idToken = req.headers.get("privy-id-token");
  if (idToken && isIdentityPath(joined)) headers["privy-id-token"] = idToken;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (method === "GET" && isPublicGet(joined.split("/"))) cachePut(url, text, res.status);
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Kash proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Kash is unreachable." } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");

  if (isPublicGet(path)) {
    const url = `${BASE}/${joined}${req.nextUrl.search}`;
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": "application/json" },
      });
    }
    return forward(req, joined, "GET");
  }

  if (IDENTITY_GET_PATHS.has(joined)) {
    const denied = await identityGate(req);
    if (denied) return denied;
    return forward(req, joined, "GET");
  }

  // Everything else must name a wallet the session owns; a path outside the
  // recognized set is refused rather than blind-forwarded.
  const claimed = walletOfGet(path, req.nextUrl.searchParams);
  if (!claimed) return notFound();
  const denied = await walletGate(req, claimed);
  if (denied) return denied;
  return forward(req, joined, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");

  if (IDENTITY_POST_PATHS.has(joined)) {
    const denied = await identityGate(req);
    if (denied) return denied;
    const body = await req.text();
    return forward(req, joined, "POST", body || undefined);
  }

  if (!WALLET_POST_PATHS.has(joined)) return notFound();

  const body = await req.text();
  let claimed: string | null = null;
  try {
    const parsed = JSON.parse(body) as { wallet?: unknown };
    if (typeof parsed.wallet === "string") claimed = parsed.wallet;
  } catch {
    // Falls through to the ownership check, which rejects a null wallet.
  }
  const denied = await walletGate(req, claimed);
  if (denied) return denied;

  return forward(req, joined, "POST", body || undefined);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!IDENTITY_PUT_PATHS.has(joined)) return notFound();

  const denied = await identityGate(req);
  if (denied) return denied;

  const body = await req.text();
  return forward(req, joined, "PUT", body || undefined);
}
