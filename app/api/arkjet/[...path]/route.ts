import { NextResponse, type NextRequest } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";
import { verifyRequest } from "@/lib/server/auth";

// Keep browsers on the app origin. In development the proxy talks directly to
// the Rust worker; production uses the normal /v1/arkjet gateway registration.
const LOCAL_DEV_ARKJET_API = "http://127.0.0.1:8096";
const BASE =
  process.env.ARKJET_API_URL ??
  (process.env.NODE_ENV === "development" ? LOCAL_DEV_ARKJET_API : undefined) ??
  process.env.NEXT_PUBLIC_ARKJET_API_URL ??
  wsapiService("arkjet");
const NO_STORE = "no-store, max-age=0, must-revalidate";

const PUBLIC_READ =
  /^(?:capabilities|rounds\/(?:current|history|[0-9a-f-]{36})|fairness\/(?:rules|commitments\/current|proofs\/[0-9a-f-]{36})|risk\/rules)$/iu;
const CHAT_PATH = /^chat(?:\/|$)/u;
const CHAT_LIKE = /^chat\/messages\/[0-9a-f-]{36}\/like$/iu;
const BET_READ = /^bets\/(?:current|history|balance)$/u;
const BET_ID = /^bets\/[0-9a-f-]{36}$/iu;
const BET_CASHOUT = /^bets\/[0-9a-f-]{36}\/cashout$/iu;
const FUNDING_CONFIG = "funding/config";
const FUNDING_WRITE = /^funding\/(?:deposits\/confirm|withdrawals)$/u;
const CHICKEN_PUBLIC_READ = /^(?:chicken\/rules|chicken\/proofs\/[0-9a-f-]{36})$/iu;
const CHICKEN_READ = /^chicken\/sessions\/(?:active|history)$/u;
const CHICKEN_START = /^chicken\/(?:sessions|autoplay)$/u;
const CHICKEN_ACTION = /^chicken\/sessions\/[0-9a-f-]{36}\/(?:steps|cashout)$/iu;

function invalidPath() {
  return NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: "Unknown Arkjet route." } },
    { status: 404, headers: { "cache-control": NO_STORE } }
  );
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to use Arkjet." } },
    { status: 401, headers: { "cache-control": NO_STORE } }
  );
}

function forwardAuthHeaders(req: NextRequest, headers: Record<string, string>): void {
  const authorization = req.headers.get("authorization");
  const accessToken = req.cookies.get("privy-token")?.value;
  const identityToken =
    req.headers.get("privy-id-token") ?? req.cookies.get("privy-id-token")?.value;
  if (authorization) headers.authorization = authorization;
  else if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (identityToken) headers["privy-id-token"] = identityToken;
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST" | "PUT" | "DELETE"
) {
  const isChat = CHAT_PATH.test(joined);
  const isBet =
    joined === "bets" || BET_READ.test(joined) || BET_ID.test(joined) || BET_CASHOUT.test(joined);
  const isFundingWrite = FUNDING_WRITE.test(joined);
  const isChicken =
    CHICKEN_READ.test(joined) || CHICKEN_START.test(joined) || CHICKEN_ACTION.test(joined);
  const requiresAuth = isChat || isBet || isFundingWrite || isChicken;
  const allowed =
    (method === "GET" &&
      (PUBLIC_READ.test(joined) ||
        joined === FUNDING_CONFIG ||
        CHICKEN_PUBLIC_READ.test(joined) ||
        CHICKEN_READ.test(joined) ||
        joined === "chat" ||
        BET_READ.test(joined))) ||
    (method === "POST" &&
      (joined === "fairness/verify" ||
        joined === "chicken/proofs/verify" ||
        CHICKEN_START.test(joined) ||
        CHICKEN_ACTION.test(joined) ||
        joined === "chat/messages" ||
        joined === "chat/presence" ||
        joined === "bets" ||
        isFundingWrite ||
        BET_CASHOUT.test(joined))) ||
    (method === "PUT" && CHAT_LIKE.test(joined)) ||
    (method === "DELETE" && (CHAT_LIKE.test(joined) || BET_ID.test(joined)));
  if (!allowed) return invalidPath();
  if (requiresAuth && !(await verifyRequest(req))) return unauthorized();

  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    body = await req.text();
  }
  if (requiresAuth) forwardAuthHeaders(req, headers);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": NO_STORE,
      },
    });
  } catch (error) {
    console.error("Arkjet proxy failed:", joined, error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Arkjet is unreachable right now." },
      },
      { status: 502, headers: { "cache-control": NO_STORE } }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path.join("/"), "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path.join("/"), "POST");
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path.join("/"), "PUT");
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path.join("/"), "DELETE");
}
