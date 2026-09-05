import { NextResponse, type NextRequest } from "next/server";
import {
  calculationRequestSchema,
  eventMarketsRequestSchema,
  prepareOrderRequestSchema,
  sportsbookSchemaFor,
  submitOrderRequestSchema,
  submitRedemptionRequestSchema,
} from "@/lib/api/schemas/sportsbook";
import { verifyRequest } from "@/lib/server/auth";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { wsapiService } from "@/lib/wsapi-base";

const BASE =
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:8086" : wsapiService("prediction");

function safePath(path: string[]): string | null {
  const joined = path.join("/");
  if (!joined || joined.includes("..") || joined.includes("%") || joined.includes("\\")) {
    return null;
  }
  return joined;
}

function isPublicGet(path: string): boolean {
  return (
    path === "capabilities" ||
    path === "navigation" ||
    path === "events" ||
    path === "search" ||
    /^events\/\d+$/u.test(path) ||
    path === "realtime" ||
    path === "realtime/status"
  );
}

function isPrivateGet(path: string): boolean {
  return (
    path === "orders" ||
    /^orders\/booking\/[A-Z0-9]+$/iu.test(path) ||
    /^orders\/[0-9a-f-]+$/iu.test(path) ||
    /^orders\/[0-9a-f-]+\/redemption$/iu.test(path)
  );
}

function isPublicPost(path: string): boolean {
  return path === "calculations" || path === "events/markets";
}

function isPrivatePost(path: string): boolean {
  return (
    path === "orders/prepare" ||
    /^orders\/[0-9a-f-]+\/submit$/iu.test(path) ||
    /^orders\/[0-9a-f-]+\/redemption\/prepare$/iu.test(path) ||
    /^orders\/[0-9a-f-]+\/redemption\/submit$/iu.test(path)
  );
}

function forwardedHeaders(req: NextRequest): Headers {
  const headers = new Headers({ accept: "application/json" });
  const authorization = req.headers.get("authorization");
  const identityToken = req.headers.get("privy-id-token");
  const idempotency = req.headers.get("idempotency-key");
  if (authorization) headers.set("authorization", authorization);
  if (identityToken) headers.set("privy-id-token", identityToken);
  if (idempotency) headers.set("idempotency-key", idempotency);
  return headers;
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
    { status: 401 }
  );
}

function unavailable() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Sportsbook is unreachable right now." },
    },
    { status: 502 }
  );
}

async function jsonResponse(response: Response, method: string, upstreamPath: string) {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return unavailable();
  }
  const contract = checkUpstream(sportsbookSchemaFor(method, upstreamPath), payload, {
    service: "sportsbook",
    path: upstreamPath,
  });
  if (!contract.ok) {
    console.error(contract.problem);
    return NextResponse.json(
      {
        success: false,
        error: { code: "UPSTREAM_CONTRACT", message: "Sportsbook returned invalid data." },
      },
      { status: 502 }
    );
  }
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const joined = safePath((await ctx.params).path);
  if (!joined || (!isPublicGet(joined) && !isPrivateGet(joined))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isPrivateGet(joined) && !(await verifyRequest(req))) return unauthorized();

  const query = req.nextUrl.searchParams.toString();
  const upstreamPath = `sportsbook/${joined}`;
  try {
    const response = await fetch(`${BASE}/${upstreamPath}${query ? `?${query}` : ""}`, {
      cache: "no-store",
      headers: forwardedHeaders(req),
      signal: joined === "realtime" ? undefined : AbortSignal.timeout(15_000),
    });
    if (joined === "realtime" && response.body) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }
    return jsonResponse(response, "GET", upstreamPath);
  } catch (error) {
    console.error("Sportsbook read proxy failed:", joined, error);
    return unavailable();
  }
}

function requestSchema(path: string) {
  if (path === "calculations") return calculationRequestSchema;
  if (path === "events/markets") return eventMarketsRequestSchema;
  if (path === "orders/prepare") return prepareOrderRequestSchema;
  if (/^orders\/[0-9a-f-]+\/submit$/iu.test(path)) return submitOrderRequestSchema;
  if (/^orders\/[0-9a-f-]+\/redemption\/submit$/iu.test(path)) {
    return submitRedemptionRequestSchema;
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const joined = safePath((await ctx.params).path);
  if (!joined || (!isPublicPost(joined) && !isPrivatePost(joined))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isPrivatePost(joined) && !(await verifyRequest(req))) return unauthorized();

  const body = await req.text();
  const schema = requestSchema(joined);
  if (schema) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body." } },
        { status: 400 }
      );
    }
    if (!schema.safeParse(parsed).success) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Invalid request body." } },
        { status: 400 }
      );
    }
  }

  const headers = forwardedHeaders(req);
  headers.set("content-type", "application/json");
  const upstreamPath = `sportsbook/${joined}`;
  try {
    const response = await fetch(`${BASE}/${upstreamPath}`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    return jsonResponse(response, "POST", upstreamPath);
  } catch (error) {
    console.error("Sportsbook write proxy failed:", joined, error);
    return unavailable();
  }
}
