import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { irisRequest, irisRoute, validIrisBody } from "@/lib/server/cctp";

// Server-side proxy to Circle's CCTP attestation service, for the perps funding
// rail: the Base -> HyperCore deposit sizes its burn fee from the live quote,
// and the Arbitrum -> Base withdrawal leg waits here for the attestation that
// lets it mint. GET only, allowlisted, signed-in sessions only.

function error(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const route = irisRoute(path.join("/"), req.nextUrl.searchParams);
  if (route.kind === "notFound") return error(404, "NOT_FOUND", "Not found");
  if (route.kind === "badRequest") return error(400, "BAD_REQUEST", "Invalid request");

  if (!(await verifyRequest(req))) {
    return error(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  let upstream: Response;
  try {
    upstream = await irisRequest(route.upstreamPath);
  } catch (err) {
    console.error("CCTP proxy failed:", err);
    return error(502, "SERVICE_UNAVAILABLE", "Transfer service unreachable");
  }

  // Not indexed yet: the caller keeps polling.
  if (upstream.status === 404) return error(404, "NOT_FOUND", "Not found");
  if (!upstream.ok) {
    console.error("CCTP upstream answered", upstream.status, route.upstreamPath);
    return error(502, "SERVICE_UNAVAILABLE", "Transfer service unreachable");
  }

  const body = validIrisBody(route.kind, await upstream.json().catch(() => undefined));
  if (body === null) {
    console.error("CCTP upstream answered an unexpected shape for", route.upstreamPath);
    return error(502, "BAD_UPSTREAM", "Transfer service answered unexpectedly");
  }
  // The app's one envelope, so the browser reads this with the one transport.
  return NextResponse.json({ success: true, data: body });
}
