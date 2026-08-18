import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  cacheSecondsFor,
  dextopusRequest,
  isAllowedPath,
  splitPurpose,
} from "@/lib/server/dextopus";

function providerUnavailableStatus(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      depositRequestId: req.nextUrl.searchParams.get("depositRequestId") ?? "",
      depositAddress: "",
      status: "PENDING",
      executionStatus: "PROVIDER_UNAVAILABLE",
      originTransactionHashes: [],
      destinationTransactionHashes: [],
      providerUnavailable: true,
      retryAfterMs: 30_000,
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    }
  );
}

async function proxy(req: NextRequest, path: string[], method: "GET" | "POST", body?: unknown) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { purpose, path: joined } = splitPurpose(path.join("/"));
  if (!isAllowedPath(joined)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const res = await dextopusRequest(joined, {
      method,
      purpose,
      query: method === "GET" ? req.nextUrl.searchParams : undefined,
      body,
      revalidate: method === "GET" ? cacheSecondsFor(joined) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    // Status is reconciliation, not a new money-moving command. During a
    // provider outage keep the operation pending and tell the state machine
    // when to check again instead of flooding the browser with 5xx responses.
    if (joined === "deposit/status" && res.status >= 500) {
      return providerUnavailableStatus(req);
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Dextopus proxy failed:", error);
    if (joined === "deposit/status") return providerUnavailableStatus(req);
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
