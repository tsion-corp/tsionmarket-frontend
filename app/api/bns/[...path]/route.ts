import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { checkUpstream } from "@/lib/server/validate-upstream";
import {
  bnsAvailabilitySchema,
  bnsCommitmentSchema,
  bnsLabelExpirySchema,
  bnsPriceSchema,
  bnsResolvedNameSchema,
  bnsReverseNameSchema,
  bnsStoreSchema,
  bnsTransactionSchema,
} from "@/lib/api/schemas/bns";
import { isSafeProxyPath } from "@/lib/server/proxy-path";
import { wsapiService } from "@/lib/wsapi-base";

// Production routes through the gateway (`/v1/bns/*`). BNS_API_BASE_URL is a
// local-dev override ONLY — same pattern as PERP_API_BASE_URL — so a developer
// can point at a locally-run bns service (e.g. http://localhost:8101, served at
// its own root, no /v1/bns prefix) and control its RPC. Unset in production.
const BASE = process.env.BNS_API_BASE_URL ?? wsapiService("bns");
const GET_PATH =
  /^(?:stores\/ark(?:\/commitment-window|\/labels\/[^/]+\/(?:available|price|expires))?|resolve\/[^/]+|reverse\/0x[0-9a-fA-F]{40})$/;
const POST_PATH = /^stores\/ark\/labels\/[^/]+\/(?:commitment|renew)$|^stores\/ark\/register$/;

function responseSchema(method: "GET" | "POST", path: string) {
  if (method === "POST") {
    return path.endsWith("/commitment") ? bnsCommitmentSchema : bnsTransactionSchema;
  }
  if (path === "stores/ark") return bnsStoreSchema;
  if (path.endsWith("/price")) return bnsPriceSchema;
  if (path.endsWith("/available")) return bnsAvailabilitySchema;
  if (path.endsWith("/expires")) return bnsLabelExpirySchema;
  if (path.startsWith("resolve/")) return bnsResolvedNameSchema;
  if (path.startsWith("reverse/")) return bnsReverseNameSchema;
  return null;
}

async function proxy(req: NextRequest, path: string[], method: "GET" | "POST"): Promise<Response> {
  const joined = path.join("/");
  const allowed = method === "GET" ? GET_PATH.test(joined) : POST_PATH.test(joined);
  if (!isSafeProxyPath(joined) || !allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (method === "POST" && !(await verifyRequest(req))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
      { status: 401 }
    );
  }

  try {
    const url = new URL(`${BASE}/${joined}`);
    if (method === "GET") url.search = req.nextUrl.search;
    const res = await fetch(url, {
      method,
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      body: method === "POST" ? await req.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    const check = checkUpstream(responseSchema(method, joined), data, {
      service: "bns",
      path: joined,
    });
    if (!check.ok) {
      console.error(check.problem);
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_RESPONSE", message: "Ark name response was not understood." },
        },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("BNS proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Ark names are unreachable." },
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
  return proxy(req, path, "POST");
}
