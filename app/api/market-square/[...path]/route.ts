import { marketSquareProxyPaths, type ProxyMethod } from "@/lib/api/market-square-proxy-paths";
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
  method: ProxyMethod,
  body?: string | ArrayBuffer,
  contentType?: string
): Promise<NextResponse> {
  const search = req.nextUrl.searchParams.toString();
  const url = `${BASE}/${joined}${search ? `?${search}` : ""}`;
  const authorization = bearerOf(req);
  const headers: Record<string, string> = { accept: "application/json" };
  if (authorization) headers.authorization = authorization;
  // Multipart carries its BOUNDARY in the content-type, so it is copied
  // verbatim; rewriting or dropping it corrupts the payload as thoroughly as
  // losing the bytes, and multer answers a boundary-less body with a bare 500.
  if (body !== undefined) headers["content-type"] = contentType ?? "application/json";

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
  // The square's public reads answer anybody upstream, so gating them here
  // turned the dashboard's whole social section into a 401 for signed-out
  // readers. The token is still forwarded when present, so viewer state keeps
  // resolving for everyone else.
  if (!marketSquareProxyPaths.isPublicGet(joined) && !(await verifyRequest(req))) {
    return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  }
  return forward(req, joined, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!marketSquareProxyPaths.allows("POST", joined))
    return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  const incoming = req.headers.get("content-type") ?? "";
  if (incoming.startsWith("multipart/form-data")) {
    // Buffered rather than streamed: a streamed body arrives empty at the
    // service on Vercel, and an empty multipart becomes an unhandled 500 there
    // rather than a useful error here. Vercel caps request bodies at 4.5MB
    // before this code runs, so this can never hold more than that.
    if (!incoming.includes("boundary=")) {
      return jsonError("VALIDATION_ERROR", "Malformed upload — no multipart boundary.", 400);
    }
    return forward(req, joined, "POST", await req.arrayBuffer(), incoming);
  }
  const body = await req.text();
  return forward(req, joined, "POST", body || undefined);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!marketSquareProxyPaths.allows("DELETE", joined))
    return jsonError("NOT_FOUND", "Not found", 404);
  if (!(await verifyRequest(req))) return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
  return forward(req, joined, "DELETE");
}
