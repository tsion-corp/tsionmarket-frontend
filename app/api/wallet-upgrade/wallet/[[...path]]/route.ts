import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { readUpgradeEnv, walletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { unauthorized } from "@/lib/server/migration";
import { MAX_WALLET_BODY_BYTES, walletPath, walletServiceBase } from "@/lib/server/wallet-service";
import { decaneBearer, upstreamProblem } from "@/lib/server/wallet-upgrade";

// The browser's only way to the wallet service. The caller's session in (Decane's
// by default, Clerk's when that path is on), the same bearer out; the service itself decides what that session may do (it can read the
// encrypted package but change nothing without a device or recovery signature).

function refuse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const config = walletUpgradeConfig(readUpgradeEnv());
  if (!config.walletAvailable) {
    return refuse(
      503,
      "NOT_AVAILABLE",
      config.blockedReason ?? "The wallet service is not switched on."
    );
  }
  const base = walletServiceBase();
  if (!base) return refuse(503, "NOT_CONFIGURED", "The wallet service is not configured.");
  const problem = upstreamProblem({
    target: config.target,
    base,
    allowProduction: process.env.WALLET_UPGRADE_ALLOW_PROD_UPSTREAM === "true",
  });
  if (problem) return refuse(503, "NOT_AVAILABLE", problem);

  const { path = [] } = await ctx.params;
  const upstream = walletPath(req.method, path);
  if (!upstream) return refuse(404, "NOT_FOUND", "Not found.");

  // Whose session vouches for the caller: Decane's, the live sign-in, unless the
  // parked Clerk path is switched on. The wallet service verifies it either way.
  let token: string | null;
  if (config.auth === "decane") {
    token = decaneBearer(req);
  } else {
    const { userId, getToken } = await auth();
    token = userId ? await getToken() : null;
  }
  if (!token) return unauthorized();

  const body = req.method === "GET" ? undefined : await req.text();
  if (body !== undefined && body.length > MAX_WALLET_BODY_BYTES) {
    return refuse(413, "VALIDATION_ERROR", "Request too large.");
  }

  try {
    const res = await fetch(`${base}${upstream}`, {
      method: req.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Wallet service proxy failed:", upstream, error);
    return refuse(502, "UPSTREAM_ERROR", "The wallet service is unreachable.");
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
