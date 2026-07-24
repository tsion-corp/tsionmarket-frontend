import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { DEPOSIT_BRIDGE_URL } from "@/lib/polymarket/config";

// Proxies Polymarket's deposit-bridge address request. Sending USDC to the
// returned address auto-wraps it to pUSD in the user's Deposit Wallet. Proxied
// (not called from the browser) to avoid CORS and to attach our builder code.
export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address) {
    return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
  }

  const builderCode = process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE;
  try {
    const res = await fetch(DEPOSIT_BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(builderCode ? { "X-Builder-Code": builderCode } : {}),
      },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Polymarket deposit bridge failed:", error);
    return NextResponse.json({ error: "Deposit bridge request failed" }, { status: 502 });
  }
}
