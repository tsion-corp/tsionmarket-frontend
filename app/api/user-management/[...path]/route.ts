import { NextResponse, type NextRequest } from "next/server";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { isSafeProxyPath } from "@/lib/server/proxy-path";
import { userManagementProxyPath, type ProxyMethod } from "@/lib/api/user-management-proxy-paths";
import { userManagementSchemaFor } from "@/lib/api/schemas/user-management";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the user-management service: the notification inbox,
// the browser push subscriptions behind it, and the wallet balance read. The
// gateway sends no CORS headers, so routing through our own origin is what
// makes the service reachable from the browser at all, and it keeps the
// gateway URL out of the bundle.
//
// The service verifies the caller's Privy access token itself and requires
// the did in the path to equal the token's subject, so this proxy holds no
// secret. What it holds is the allowlist and the identity check: every path is
// on the allowlist, every method needs a verified session naming the same
// person the path does, and the answer is judged against the contract before
// it can reach a component.
//
// Every message here is domain-neutral on purpose. One handler serves the
// inbox, push and balances, so copy naming any one of them would tell a
// reader about the wrong feature.
//
// Nothing here is logged with a did, an Authorization header or a push
// endpoint in it. The endpoint is a capability URL: anybody holding it can
// push to that device.
//
// USER_MANAGEMENT_API_URL is a local override for pointing this one service
// at a local instance; unset, it derives from the gateway like every other.
const BASE = process.env.USER_MANAGEMENT_API_URL ?? wsapiService("user-management");
const NO_STORE = "no-store, max-age=0, must-revalidate";
const REQUEST_ID_HEADER = "x-request-id";

// Every failure carries an id so a support report has a reference, whichever
// side failed. It is echoed as a header too, so the one transport can tag a
// report without consuming the body.
function failure(code: string, message: string, status: number) {
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    { success: false, error: { code, message, requestId } },
    { status, headers: { "cache-control": NO_STORE, [REQUEST_ID_HEADER]: requestId } }
  );
}

// What a log line may say about a request. The did is the second segment of
// every relayed path, and naming the person is exactly what must not happen.
function routeLabel(segments: string[]): string {
  return segments.map((segment, index) => (index === 1 ? ":user" : segment)).join("/");
}

// The caller's bearer token. The browser sends it on our own origin, and the
// cookie is the fallback for a same-origin call that carried no header.
function bearerOf(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header;
  const cookie = req.cookies.get("privy-token")?.value;
  return cookie ? `Bearer ${cookie}` : null;
}

function clientIpOf(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

function parseJson(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isFailureEnvelope(parsed: unknown): boolean {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { success?: unknown }).success === false &&
    "error" in parsed
  );
}

// A client error is the service's own judgement of what the caller sent, and
// the status is the answer. A 409 says web push is not configured and a 400
// says the subscription was rejected; the hooks branch on both, so neither may
// be flattened into a 502.
const CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

function clientFailure(status: number, text: string) {
  const parsed = parseJson(text);
  if (isFailureEnvelope(parsed)) {
    return new NextResponse(text, {
      status,
      headers: { "content-type": "application/json", "cache-control": NO_STORE },
    });
  }
  return failure(CODE_BY_STATUS[status] ?? "UPSTREAM_ERROR", "That request was refused.", status);
}

async function forward(
  req: NextRequest,
  segments: string[],
  method: ProxyMethod
): Promise<NextResponse> {
  const route = userManagementProxyPath(segments, method);
  if (!route.ok) return failure("NOT_FOUND", "Not found.", 404);
  if (!BASE) return failure("NOT_CONFIGURED", "This isn't configured yet.", 503);

  // Checked here as well as upstream so an expired session fails with our own
  // message rather than a bare 401 from a service the user never hears of.
  const claims = await verifyRequest(req);
  if (!claims) return failure("UNAUTHORIZED", "Sign in to continue.", 401);

  // Every path here is scoped to one person, and the proxy forwards that
  // person's own token, so without this the only thing refusing person A a
  // read of person B's inbox or wallet balances is the upstream 403. This is
  // the second line of defence.
  //
  // Compared against the raw segment, not `route.path`, which carries the did
  // percent-encoded as one URL segment. Exactly, not case-insensitively: a
  // DID's method-specific id is case-sensitive and the service compares it to
  // the token's subject verbatim, so folding case here would admit requests
  // the service refuses and make this the one lenient link in the chain.
  if (claims.userId !== segments[1]) {
    return failure("FORBIDDEN", "That isn't your account.", 403);
  }

  // The allowlist already matched the did as one segment; this is the same
  // guard the other proxies apply, kept so a later edit to the shapes cannot
  // silently let a traversal through.
  if (!isSafeProxyPath(route.path)) return failure("BAD_REQUEST", "Invalid path.", 400);

  const label = routeLabel(segments);
  // The cursor is an opaque timestamp that has to go back exactly as it came,
  // so the query string is forwarded verbatim rather than re-serialised.
  const url = `${BASE}/${route.path}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const authorization = bearerOf(req);
  if (authorization) headers.authorization = authorization;
  const ip = clientIpOf(req);
  if (ip) headers["x-forwarded-for"] = ip;

  let body: string | undefined;
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    // The DELETE body names the endpoint to remove, so it is forwarded like
    // any other write body.
    body = (await req.text()) || undefined;
  }

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
    console.error("User management proxy failed:", label, error);
    return failure("UPSTREAM_ERROR", "That service is unreachable.", 502);
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) return clientFailure(res.status, text);
    console.error("User management upstream failed:", label, res.status);
    return failure("UPSTREAM_ERROR", "That service is unreachable.", 502);
  }

  const schema = userManagementSchemaFor(route.path, method);
  const parsed = parseJson(text);
  if (parsed === null) {
    console.error("User management returned invalid JSON:", label);
    return failure("BAD_RESPONSE", "That service returned an invalid response.", 502);
  }
  const contract = checkUpstream(schema, parsed, { service: "user-management", path: label });
  if (!contract.ok) {
    console.error(contract.problem);
    return failure("BAD_RESPONSE", "That service returned an invalid response.", 502);
  }

  // Never cached, at any layer: every one of these answers is private to the
  // one user whose token fetched it.
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json", "cache-control": NO_STORE },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, "POST");
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, "DELETE");
}
