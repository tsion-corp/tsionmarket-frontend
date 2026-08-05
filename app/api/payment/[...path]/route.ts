import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side gateway to the payment service's off-ramp API. The service is
// public and keyless, but every call still routes through here so the browser
// talks to one origin, the surface stays allowlisted, and money endpoints are
// only reachable signed in.
const BASE = wsapiService("payment");

// The exact off-ramp surface the flow uses; anything else 404s here rather
// than fanning the whole service out to the client.
const GET_PATHS = [/^corridors$/, /^corridors\/[A-Za-z]{2}\/banks$/, /^offramp\/orders\/[\w-]+$/];
const POST_PATHS = [/^offramp\/quote$/, /^offramp\/orders$/, /^offramp\/verify-recipient$/];

async function proxy(req: NextRequest, path: string[], method: "GET" | "POST", body?: unknown) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const joined = path.join("/");
  const allowed = (method === "GET" ? GET_PATHS : POST_PATHS).some((re) => re.test(joined));
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const res = await fetch(`${BASE}/${joined}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // Corridors and bank lists barely change; quotes and orders must not cache.
      ...(method === "GET" && !joined.startsWith("offramp/orders")
        ? { next: { revalidate: 300 } }
        : { cache: "no-store" as const }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Payment proxy failed:", error);
    return NextResponse.json({ error: "Provider request failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxy(req, path, "POST", body);
}
