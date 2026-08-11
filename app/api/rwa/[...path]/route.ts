import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { rwaSchemaFor } from "@/lib/api/schemas/rwa";
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

  // Forward the originating IP on trade calls so the gateway rate-limits per user
  // rather than lumping every user behind this server's shared address. GETs are
  // left untouched so their shared response cache is not fragmented per client.
  const clientIp =
    method === "POST"
      ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        req.headers.get("x-real-ip") ??
        undefined)
      : undefined;

  try {
    const res = await wsapiRwaRequest(joined, {
      method,
      query: method === "GET" ? req.nextUrl.searchParams : undefined,
      body,
      revalidate: method === "GET" ? rwaRevalidate(joined) : undefined,
      clientIp,
    });
    const data = await res.json().catch(() => ({}));
    // A build response carries the transactions the user is asked to sign, so
    // a contract change stops here rather than reaching a wallet.
    const check = checkUpstream(rwaSchemaFor(joined), data, { service: "rwa", path: joined });
    if (!check.ok) {
      console.error(check.problem);
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_RESPONSE", message: "RWA response was not understood" },
        },
        { status: 502 }
      );
    }
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
