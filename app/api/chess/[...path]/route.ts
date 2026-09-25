import { NextResponse, type NextRequest } from "next/server";
import { Buffer } from "node:buffer";
import {
  accessTokenFromCookie,
  getRequestIdentity,
  getRequestUser,
  verifyRequest,
} from "@/lib/server/auth";
import {
  chessDisplayNameOfUser,
  chessReadNeedsSession,
  withChessCountry,
  withChessReadIdentity,
  withChessIdentity,
} from "@/lib/server/chess-identity";
import { detectRequestCountry } from "@/lib/server/ipinfo";
import { lotterySchemaFor } from "@/lib/api/schemas/lottery";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { chessUpstreamCandidates } from "@/lib/server/chess-upstream";
import { fetchUpstreamRead, fetchUpstreamWrite } from "@/lib/server/upstream-failover";

// Server-side proxy for the chess service on the platform gateway. Same
// arrangement as the other service proxies in this app: routing through our
// origin keeps every external API proxied and lets us attach the caller's
// identity server-side.
//
// Reads are public: the lobby, a board, its moves and its PGN are all
// spectator-visible, except per-caller reads such as cashier balance and the
// caller's own bets. Writes act on a game or a cashier balance, so they need a
// verified session and the wallet that session owns.
const UPSTREAMS = chessUpstreamCandidates();
const NO_STORE = "no-store, max-age=0, must-revalidate";
const COUNTRY_WRITE = /^(?:matches|matches\/[^/]+\/join|arenas\/[^/]+\/join|play\/computer)$/u;
const PLAYER_PROFILE_WRITE = /^(?:matches|matches\/[^/]+\/join|computer\/matches|play\/computer)$/u;
const SERVER_RENDERED_PAGE = /^(?:play|challenge|competition)(?:\/|$)/u;

// Just long enough to collapse the concurrent polls of two players watching the
// same board, and short enough that neither sees a stale position. The match
// poll runs at 2s, so anything longer would serve a cached board more often
// than a fresh one.
const CACHE_TTL_MS = 1000;
const cache = new Map<
  string,
  { expires: number; body: string; status: number; contentType: string }
>();

function forwardedLocation(joined: string, location: string): string {
  if (!location.startsWith("/") || location.startsWith("//")) return location;
  // Server-rendered forms submit inside the chess iframe. Keep redirects in
  // that document so its load bridge can promote one canonical parent route;
  // redirecting directly to /casino/chess here would mount Next inside Next.
  return SERVER_RENDERED_PAGE.test(joined) ? `/api/chess${location}` : location;
}

function cacheTtlMs(joined: string): number {
  // Server-rendered lobby and challenge pages contain viewer-specific state.
  if (SERVER_RENDERED_PAGE.test(joined)) return 0;
  if (/^challenges(?:\/|$)/u.test(joined)) return 0;
  // The exact match snapshot carries lifecycle transitions. It is the repair
  // path when a creator misses the opponent-joined socket frame, so even a tiny
  // cache can replay `waiting` after the game is active. Move history and PGN
  // are immutable enough for a very short request-collapse window.
  if (/^matches\/[^/]+$/u.test(joined)) return 0;
  if (/^matches\/[^/]+\/(?:moves|pgn)$/u.test(joined)) return 250;
  // Per-caller reads are never cached or shared.
  if (joined.startsWith("cashier/")) return 0;
  if (/^betting\/markets\/[^/]+\/bets$/u.test(joined)) return 0;
  if (/^betting\/swiss\/[^/]+\/bets$/u.test(joined)) return 0;
  if (/^players\/[^/]+\/product-access$/u.test(joined)) return 0;
  if (/^players\/[^/]+\/coach(?:\/|$)/u.test(joined)) return 0;
  if (/^computer\/matches\/[^/]+\/coach$/u.test(joined)) return 0;
  if (joined === "puzzles/next") return 0;
  return CACHE_TTL_MS;
}

function notConfigured() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Chess isn't configured yet." },
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
      error: {
        code: "NO_WALLET",
        message: "Your account has no wallet to play with yet.",
      },
    },
    { status: 400, headers: { "cache-control": NO_STORE } }
  );
}

function forwardAuthHeaders(req: NextRequest, headers: Record<string, string>): void {
  const authorization = req.headers.get("authorization");
  const accessToken = accessTokenFromCookie((name) => req.cookies.get(name)?.value);
  const identityToken =
    req.headers.get("privy-id-token") ?? req.cookies.get("privy-id-token")?.value;

  if (authorization) headers.authorization = authorization;
  else if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (identityToken) headers["privy-id-token"] = identityToken;
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: string,
  wallet?: string,
  searchParams?: URLSearchParams,
  countryCode?: string | null,
  displayName?: string | null,
  requestContentType?: string | null
) {
  const search = searchParams ? searchParams.toString() : req.nextUrl.searchParams.toString();
  const query = search ? `?${search}` : "";
  const cacheKey = `${joined}${query}`;
  const headers: Record<string, string> = {
    accept: req.headers.get("accept") ?? "application/json",
  };
  if (method !== "GET") {
    headers["content-type"] = requestContentType ?? "application/json";
  }
  if (SERVER_RENDERED_PAGE.test(joined)) headers["x-forwarded-prefix"] = "/api/chess";
  if (wallet) {
    headers["x-wallet-address"] = wallet;
    forwardAuthHeaders(req, headers);
  }
  if (countryCode) headers["x-country-code"] = countryCode;
  if (displayName) {
    headers["x-player-display-name-b64"] = Buffer.from(displayName, "utf8").toString("base64url");
  }
  const ttl = cacheTtlMs(joined);

  try {
    const init: RequestInit = {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: SERVER_RENDERED_PAGE.test(joined) ? "manual" : "follow",
    };
    const res =
      method === "GET"
        ? await fetchUpstreamRead(UPSTREAMS, cacheKey, init, 15_000)
        : await fetchUpstreamWrite(UPSTREAMS, cacheKey, init, 15_000);
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "text/plain; charset=utf-8";
    const lotterySchema = lotterySchemaFor(joined);
    if (res.ok && lotterySchema) {
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        console.error(`Chess ${joined} returned invalid JSON.`);
        return NextResponse.json(
          {
            success: false,
            error: { code: "UPSTREAM_CONTRACT", message: "Chess returned an invalid response." },
          },
          { status: 502, headers: { "cache-control": NO_STORE } }
        );
      }
      const contract = checkUpstream(lotterySchema, payload, {
        service: "chess",
        path: joined,
      });
      if (!contract.ok) {
        console.error(contract.problem);
        return NextResponse.json(
          {
            success: false,
            error: { code: "UPSTREAM_CONTRACT", message: "Chess returned an invalid response." },
          },
          { status: 502, headers: { "cache-control": NO_STORE } }
        );
      }
    }
    if (method === "GET" && res.ok && ttl > 0) {
      cache.set(cacheKey, {
        expires: Date.now() + ttl,
        body: text,
        status: res.status,
        contentType,
      });
    }
    const responseHeaders: Record<string, string> = {
      "content-type": contentType,
      "cache-control": NO_STORE,
    };
    const location = res.headers.get("location");
    if (location) {
      responseHeaders.location = forwardedLocation(joined, location);
    }
    return new NextResponse(text, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Chess proxy failed:", joined, error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Chess is unreachable." } },
      { status: 502, headers: { "cache-control": NO_STORE } }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (UPSTREAMS.length === 0) return notConfigured();
  const joined = path.join("/");
  const ttl = cacheTtlMs(joined);
  const needsSession = chessReadNeedsSession(joined, req.nextUrl.searchParams);
  const claims = needsSession ? await verifyRequest(req) : null;
  if (needsSession && !claims) return unauthorized();
  const user =
    needsSession && claims?.provider === "privy" ? await getRequestUser(req, claims) : null;
  // Provider-agnostic wallet: Decane resolves through its address endpoint,
  // Privy through the user object. The old Privy-only path returned null for a
  // Decane session and failed the wallet check against the caller's own wallet.
  const wallet = needsSession
    ? ((await getRequestIdentity(req, claims))?.evmAddress ?? null)
    : null;
  const displayName = needsSession ? chessDisplayNameOfUser(user) : null;
  // Only a Privy session has a user object to miss: for Decane, `user` is
  // null by design and supplies nothing but the display name. Requiring it
  // here 401'd every migrated player after their token had verified.
  if (needsSession && claims?.provider === "privy" && !user) return walletUnavailable();
  if (needsSession && !wallet) return noWallet();
  const forwardedSearch = wallet
    ? withChessReadIdentity(joined, req.nextUrl.searchParams, wallet)
    : req.nextUrl.searchParams;

  const forwardedQuery = forwardedSearch.toString();
  const cacheKey = `${joined}${forwardedQuery ? `?${forwardedQuery}` : ""}`;
  if (ttl > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return new NextResponse(hit.body, {
        status: hit.status,
        headers: { "content-type": hit.contentType, "cache-control": NO_STORE },
      });
    }
  }

  return forward(
    req,
    joined,
    "GET",
    undefined,
    wallet ?? undefined,
    forwardedSearch,
    undefined,
    displayName
  );
}

async function authedWrite(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
  method: "POST" | "PUT" | "DELETE"
) {
  const { path } = await ctx.params;
  if (UPSTREAMS.length === 0) return notConfigured();

  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();

  const user = claims?.provider === "privy" ? await getRequestUser(req, claims) : null;
  // Only a Privy session has a user object to miss: for Decane, `user` is
  // null by design and supplies nothing but the display name. Requiring it
  // here 401'd every migrated player after their token had verified.
  if (claims?.provider === "privy" && !user) return walletUnavailable();
  const wallet = (await getRequestIdentity(req, claims))?.evmAddress ?? null;
  if (!wallet) return noWallet();

  const raw = await req.text();
  const joined = path.join("/");
  const requestContentType = req.headers.get("content-type");
  const isForm = requestContentType?.startsWith("application/x-www-form-urlencoded") ?? false;
  const identified = isForm ? raw : withChessIdentity(joined, raw, wallet);
  const country = COUNTRY_WRITE.test(joined) ? await detectRequestCountry(req.headers) : null;
  const displayName = PLAYER_PROFILE_WRITE.test(joined) ? chessDisplayNameOfUser(user) : null;
  return forward(
    req,
    joined,
    method,
    withChessCountry(joined, identified, country),
    wallet,
    undefined,
    country,
    displayName,
    requestContentType
  );
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
