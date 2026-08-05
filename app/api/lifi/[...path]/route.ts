import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Server-side proxy for the LI.FI aggregator. Keeps LIFI_API_KEY off the client,
// stamps every request with our integration string so usage and fees attribute
// to the "wsws" portal integration, and applies an optional swap fee. The client
// only ever talks to this route.
const LIFI_BASE = "https://li.quest/v1";
const INTEGRATOR = "wsws";

// Only the read endpoints the swap flow needs. Everything returns unsigned data;
// signing happens client-side in the embedded wallet.
const ALLOWED = new Set(["quote", "status", "token", "chains", "tools", "connections"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  if (path.length === 0 || !ALLOWED.has(path[0])) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const search = new URLSearchParams(req.nextUrl.searchParams);
  search.set("integrator", INTEGRATOR);

  // Optional integrator fee, taken from the source token. Only applied to quotes
  // and only when configured; fee receiver wallets must be set in the portal.
  const feeBps = Number(process.env.LIFI_FEE_BPS);
  if (path[0] === "quote" && Number.isFinite(feeBps) && feeBps > 0 && !search.has("fee")) {
    search.set("fee", (feeBps / 10000).toString());
  }

  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.LIFI_API_KEY;
  if (key) headers["x-lifi-api-key"] = key;

  try {
    // Status is polled every few seconds; a hung upstream must fail fast so
    // the next poll can succeed, or settled transfers read as still pending.
    const timeoutMs = path[0] === "status" ? 6_000 : 15_000;
    const res = await fetch(`${LIFI_BASE}/${path.join("/")}?${search.toString()}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("LI.FI proxy failed:", error);
    return NextResponse.json({ error: "Provider request failed" }, { status: 502 });
  }
}
