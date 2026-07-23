import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { isAllowedRwaPath, rwaRevalidate, wsapiRwaRequest } from "@/lib/server/wsapi";

async function proxy(req: NextRequest, path: string[], method: "GET" | "POST", body?: unknown) {
  const joined = path.join("/");
  if (!isAllowedRwaPath(joined)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Reading the registry is public. Quoting and building a trade require a
  // signed-in caller.
  if (method === "POST") {
    const claims = await verifyRequest(req);
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const res = await wsapiRwaRequest(joined, {
      method,
      query: method === "GET" ? req.nextUrl.searchParams : undefined,
      body,
      revalidate: method === "GET" ? rwaRevalidate(joined) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("RWA proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "RWA service unreachable" },
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
  const body = await req.json().catch(() => ({}));
  return proxy(req, path, "POST", body);
}
