import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { isAllowedPerpPath, perpRevalidate, wsapiPerpRequest } from "@/lib/server/wsapi";

// Server-side proxy for the perp gateway (Avantis perpetuals on Base). Reads
// are public market data; quote and the build endpoints are POSTs that shape a
// trade for a signed-in user, so they require a verified session. The service
// is non-custodial: build responses are unsigned transaction steps the user's
// own wallet signs, so no key or signing ever happens here.
async function proxy(req: NextRequest, path: string[], method: "GET" | "POST", body?: unknown) {
  const joined = path.join("/");
  if (!isAllowedPerpPath(joined)) {
    // Same envelope as the gateway, so unwrap() surfaces a real message
    // instead of throwing Error(undefined).
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  if (method === "POST") {
    const claims = await verifyRequest(req);
    if (!claims) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to trade." } },
        { status: 401 }
      );
    }
  }

  // Forward the originating IP on trade calls so the gateway rate-limits per
  // user rather than lumping every user behind this server's shared address.
  // GETs are left untouched so their shared response cache is not fragmented.
  const clientIp =
    method === "POST"
      ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        req.headers.get("x-real-ip") ??
        undefined)
      : undefined;

  try {
    const res = await wsapiPerpRequest(joined, {
      method,
      query: method === "GET" ? req.nextUrl.searchParams : undefined,
      body,
      revalidate: method === "GET" ? perpRevalidate(joined) : undefined,
      clientIp,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Perp proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Perp service unreachable" },
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = await req.json().catch(() => undefined);
  return proxy(req, path, "POST", body);
}
