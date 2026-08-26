import { marketSquareProxyPaths } from "@/lib/api/market-square-proxy-paths";
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
  if (!marketSquareProxyPaths.allows("GET", joined))
    return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  return forward(req, joined, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!marketSquareProxyPaths.allows("POST", joined))
    return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  const body = await req.text();
  return forward(req, joined, "POST", body || undefined);
}
