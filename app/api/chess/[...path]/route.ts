import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, verifyRequest } from "@/lib/server/auth";

// Server-side proxy for the chess service on the platform gateway. Same
// arrangement as the other service proxies in this app: routing through our
// origin keeps every external API proxied and lets us attach the caller's
// identity server-side.
//
// Reads are public: the lobby, a board, its moves and its PGN are all
// spectator-visible. Writes act on a game, so they need a verified session.
const BASE = process.env.NEXT_PUBLIC_CHESS_API_URL;

// Just long enough to collapse the concurrent polls of two players watching the
// same board, and short enough that neither sees a stale position. The match
// poll runs at 2s, so anything longer would serve a cached board more often
// than a fresh one.
const CACHE_TTL_MS = 1000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Chess isn't configured yet." },
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

// The wallet the session provably owns, when we can establish it.
//
// This needs a Privy identity token, which is an optional feature: when it is
// off, or simply not warm yet, there is no identity token on the request and
// this returns null. That is not an error, so it must not block play. The
// caller's own claim is used instead, which is no weaker than the other service
// proxies in this app and is what the upstream service reads today anyway.
async function sessionWallet(req: NextRequest): Promise<string | null> {
  const user = await getRequestUser(req);
  if (!user) return null;
  const wallet = user.linked_accounts.find(
    (a) => a.type === "wallet" && "chain_type" in a && a.chain_type === "ethereum"
  );
  return wallet && "address" in wallet ? wallet.address : null;
}

// Names the acting player. When the session's wallet is known it overrides
// whatever the client sent, so a caller cannot act as somebody else; otherwise
// the client's claim stands. Both names appear in the contract: "creator" when
// opening a game, "player" for every action on one.
function withIdentity(raw: string, wallet: string | null): string {
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return raw;
  const record = body as Record<string, unknown>;
  if (wallet) {
    if ("creator" in record) record.creator = wallet;
    if ("player" in record || !("creator" in record)) record.player = wallet;
  }
  return JSON.stringify(record);
}

// The address the request names itself by, used only to fail with a clear
// message rather than passing an anonymous write upstream.
function claimedWallet(raw: string): string | null {
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (typeof body !== "object" || body === null) return null;
    const record = body as Record<string, unknown>;
    const value = record.player ?? record.creator;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function forward(req: NextRequest, joined: string, method: "GET" | "POST", body?: string) {
  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";

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
    console.error("Chess proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Chess is unreachable." } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();
  const joined = path.join("/");

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();

  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();

  const raw = await req.text();
  const wallet = await sessionWallet(req);

  // A write has to name a player. Only when neither the session nor the client
  // can supply one is there nothing to send upstream.
  if (!wallet && !claimedWallet(raw)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NO_WALLET",
          message: "Your account has no wallet to play with yet.",
        },
      },
      { status: 400 }
    );
  }

  return forward(req, path.join("/"), "POST", withIdentity(raw, wallet));
}
