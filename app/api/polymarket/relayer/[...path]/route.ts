import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  polymarketBuilderCredentials,
  polymarketBuilderHeaders,
} from "@/lib/server/polymarket-builder";

const RELAYER_ORIGIN = "https://relayer-v2.polymarket.com";
const MAX_BODY_BYTES = 64 * 1_024;

function allowedPath(method: string, path: string): boolean {
  if (method === "POST") return path === "/submit";
  if (method !== "GET") return false;
  return (
    path === "/deployed" ||
    path === "/v1/account/transactions/params" ||
    /^\/v1\/account\/transactions\/[a-zA-Z0-9-]+$/.test(path)
  );
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await verifyRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await ctx.params;
  const path = `/${segments.join("/")}`;
  if (
    !allowedPath(req.method, path) ||
    segments.some((segment) => !segment || segment === ".." || segment.includes("\\"))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const credentials = polymarketBuilderCredentials();
  if (!credentials) {
    return NextResponse.json({ error: "Polymarket builder not configured" }, { status: 503 });
  }

  const body = req.method === "POST" ? await req.text() : undefined;
  if (body && Buffer.byteLength(body) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const query = req.nextUrl.searchParams.toString();
  const url = `${RELAYER_ORIGIN}${path}${query ? `?${query}` : ""}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      body,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...polymarketBuilderHeaders(credentials, { method: req.method, path, body }),
      },
      signal: AbortSignal.timeout(15_000),
    });

    const retryAfter = response.headers.get("retry-after");
    const headers = {
      "cache-control": "no-store",
      ...(retryAfter ? { "retry-after": retryAfter } : {}),
    };

    // The Polymarket SDK retries a 429 eleven times. Surface one 503 instead,
    // then let the UI enforce its cooldown before another user-initiated try.
    if (response.status === 429) {
      return NextResponse.json(
        { error: "Polymarket relayer is rate limited. Try again later." },
        { status: 503, headers }
      );
    }

    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        ...headers,
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("Polymarket relayer proxy failed:", { method: req.method, path, error });
    return NextResponse.json({ error: "Polymarket relayer is unreachable" }, { status: 502 });
  }
}

export function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx);
}

export function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx);
}
