import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { marketSquareSchemaFor } from "@/lib/api/schemas/market-square";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the Market Square service on the platform gateway.
// The callers are the casino's "go live" flows: chess, checkers, ArkBall and
// The Last Man all broadcast their surface as a Market Square stream, which is
// what puts it in the live hub, the stories rail and the live feed lane
// without any further integration. Every stream carries a deep link whose ref
// names the game, so Market Square can route a viewer back to the right one.
//
// Market Square authenticates with the caller's own Privy access token, so
// this proxy holds no secret of its own. What it does hold is the allowlist:
// only the handful of paths the broadcast flow needs are reachable, and every
// one of them requires a verified session before the token is forwarded.
const BASE = wsapiService("market-square");
const NO_STORE = "no-store, max-age=0, must-revalidate";

// Reads. `me` tells us whether the player carries the creator role that
// POST /streams demands; the stream read is how the panel reflects a status
// the service changed underneath us, such as the orphan reaper ending a
// stream after the host disconnected.
// `streams` is the discovery read: given a deep-link ref it answers with every
// live stream pointing at that activity, which is how a second player finds
// the broadcast their opponent already started. `speaker-requests` is the
// host's pending queue, and `speaker-requests/me` is the guest's own request,
// which carries the publishing credentials once it is approved.
const GET_PATHS = [
  /^me$/u,
  /^me\/creator-application$/u,
  /^streams$/u,
  /^streams\/[^/]+$/u,
  /^streams\/[^/]+\/speaker-requests$/u,
  /^streams\/[^/]+\/speaker-requests\/me$/u,
];

// Writes. Creating, going live and ending are the whole broadcast lifecycle.
// The creator application is the honest exit for a player who is not a
// creator yet: they can apply from where they hit the wall.
const POST_PATHS = [
  /^me\/creator-application$/u,
  /^streams$/u,
  /^streams\/[^/]+\/go-live$/u,
  /^streams\/[^/]+\/end$/u,
  // Co-publishing: the guest asks, the host approves or declines, the guest
  // fetches a publisher token, and either side can step the guest down again.
  /^streams\/[^/]+\/speaker-requests$/u,
  /^streams\/[^/]+\/speaker-requests\/[^/]+\/(approve|decline|remove|leave)$/u,
  /^streams\/[^/]+\/speaker-token$/u,
];

function allowed(patterns: RegExp[], joined: string): boolean {
  return patterns.some((pattern) => pattern.test(joined));
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "cache-control": NO_STORE } }
  );
}

// Market Square reads the caller's identity from the bearer token. The browser
// sends it on our own origin; we pass it upstream unchanged.
function bearerOf(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header;
  const cookie = req.cookies.get("privy-token")?.value;
  return cookie ? `Bearer ${cookie}` : null;
}

async function forward(
  req: NextRequest,
  joined: string,
  method: "GET" | "POST",
  body?: string
): Promise<NextResponse> {
  const search = req.nextUrl.searchParams.toString();
  const url = `${BASE}/${joined}${search ? `?${search}` : ""}`;
  const authorization = bearerOf(req);
  const headers: Record<string, string> = { accept: "application/json" };
  if (authorization) headers.authorization = authorization;
  if (method === "POST") headers["content-type"] = "application/json";

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    text = await res.text();
  } catch (error) {
    console.error("Market Square proxy failed:", joined, error);
    return jsonError("UPSTREAM_ERROR", "Market Square is unreachable.", 502);
  }

  const schema = marketSquareSchemaFor(joined, method);
  if (res.ok && schema) {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      console.error(`Market Square ${joined} returned invalid JSON.`);
      return jsonError("UPSTREAM_CONTRACT", "Market Square returned an invalid response.", 502);
    }
    const contract = checkUpstream(schema, payload, { service: "market-square", path: joined });
    if (!contract.ok) {
      console.error(contract.problem);
      return jsonError("UPSTREAM_CONTRACT", "Market Square returned an invalid response.", 502);
    }
  }

  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": NO_STORE,
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!allowed(GET_PATHS, joined)) return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  return forward(req, joined, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!allowed(POST_PATHS, joined)) return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  const body = await req.text();
  return forward(req, joined, "POST", body || undefined);
}
