import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, verifyRequest } from "@/lib/server/auth";
import {
  chessReadNeedsSession,
  walletOfUser,
  withChessReadIdentity,
  withChessIdentity,
} from "@/lib/server/chess-identity";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for draughts. The game is a module of the chess service
// rather than a service of its own, so it shares that base URL and everything
// upstream sits under /draughts. Clients call this route with the same paths
// chess uses (matches/…), and the prefix is added on the way out.
//
// Identity handling is shared with chess: the two modules take the same body
// fields (`player`, `author`, `creator`) on the same path shapes, so the same
// rules decide what may be stamped with the caller's verified wallet.
//
// Reads are public: the lobby, a board and its moves are spectator-visible. The
// exceptions are a player's private note and the player-only chat room, which
// need the session.
const LOCAL_DEV_CHESS_API = "http://127.0.0.1:8082";
const BASE =
  process.env.CHESS_API_URL ??
  (process.env.NODE_ENV === "development" ? LOCAL_DEV_CHESS_API : undefined) ??
  process.env.NEXT_PUBLIC_CHESS_API_URL ??
  wsapiService("chess");
const UPSTREAM_PREFIX = "draughts";
const NO_STORE = "no-store, max-age=0, must-revalidate";

// Just long enough to collapse the concurrent polls of two players watching the
// same board, and short enough that neither sees a stale position.
const CACHE_TTL_MS = 1000;
const cache = new Map<
  string,
  { expires: number; body: string; status: number; contentType: string }
>();

function cacheTtlMs(joined: string): number {
  // A live board and its move list are the repair path when the relay misses a
  // move, so they keep only a tiny collapse window.
  if (/^matches\/[^/]+(?:\/moves|\/pdn)?$/u.test(joined)) return 250;
  return CACHE_TTL_MS;
}

function upstreamPath(joined: string): string {
  return `${UPSTREAM_PREFIX}/${joined}`;
}

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Checkers isn't configured yet." },
    },
    { status: 503, headers: { "cache-control": NO_STORE } }
  );
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to play." } },
    { status: 401, headers: { "cache-control": NO_STORE } }
  );
}

function walletUnavailable() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Your wallet isn't ready yet. Try again." },
    },
    { status: 401, headers: { "cache-control": NO_STORE } }
  );
}

function noWallet() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NO_WALLET", message: "Your account has no wallet to play with yet." },
    },
    { status: 400, headers: { "cache-control": NO_STORE } }
  );
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: string,
  wallet?: string,
  searchParams?: URLSearchParams
) {
  const search = searchParams ? searchParams.toString() : req.nextUrl.searchParams.toString();
  const query = search ? `?${search}` : "";
  const url = `${BASE}/${upstreamPath(joined)}${query}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["content-type"] = "application/json";
  if (wallet) headers["x-wallet-address"] = wallet;
  const ttl = cacheTtlMs(joined);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "text/plain; charset=utf-8";
    if (method === "GET" && res.ok && ttl > 0) {
      cache.set(url, { expires: Date.now() + ttl, body: text, status: res.status, contentType });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": contentType, "cache-control": NO_STORE },
    });
  } catch (error) {
    console.error("Draughts proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Checkers is unreachable." } },
      { status: 502, headers: { "cache-control": NO_STORE } }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();
  const joined = path.join("/");
  const ttl = cacheTtlMs(joined);
  const needsSession = chessReadNeedsSession(joined, req.nextUrl.searchParams);
  const claims = needsSession ? await verifyRequest(req) : null;
  if (needsSession && !claims) return unauthorized();
  const user = needsSession ? await getRequestUser(req, claims) : null;
  const wallet = needsSession ? walletOfUser(user) : null;
  if (needsSession && !user) return walletUnavailable();
  if (needsSession && !wallet) return noWallet();

  const forwardedSearch = wallet
    ? withChessReadIdentity(joined, req.nextUrl.searchParams, wallet)
    : req.nextUrl.searchParams;

  const forwardedQuery = forwardedSearch.toString();
  const url = `${BASE}/${upstreamPath(joined)}${forwardedQuery ? `?${forwardedQuery}` : ""}`;
  if (ttl > 0) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": hit.contentType, "cache-control": NO_STORE },
      });
    }
  }

  return forward(req, joined, "GET", undefined, wallet ?? undefined, forwardedSearch);
}

async function authedWrite(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
  method: "POST" | "PUT" | "DELETE"
) {
  const { path } = await ctx.params;
  if (!BASE) return notConfigured();

  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();

  const user = await getRequestUser(req, claims);
  if (!user) return walletUnavailable();
  const wallet = walletOfUser(user);
  if (!wallet) return noWallet();

  const raw = await req.text();
  const joined = path.join("/");
  return forward(req, joined, method, withChessIdentity(joined, raw, wallet), wallet);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return authedWrite(req, ctx, "POST");
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return authedWrite(req, ctx, "PUT");
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return authedWrite(req, ctx, "DELETE");
}
