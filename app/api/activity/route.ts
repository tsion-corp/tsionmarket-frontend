import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchActivity } from "@/lib/server/activity";
import { isRateLimitError } from "@/lib/server/alchemy";

// Transaction history for the caller's own wallets. On-chain data, so the auth
// check only gates use of our Alchemy key; the client passes its own addresses,
// exactly as the portfolio route does.
export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const evm = req.nextUrl.searchParams.get("evm") ?? undefined;
  const solana = req.nextUrl.searchParams.get("solana") ?? undefined;

  try {
    return NextResponse.json({ items: await fetchActivity(evm, solana) });
  } catch (error) {
    console.error("Activity fetch failed:", error);
    if (isRateLimitError(error)) {
      return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not load activity" }, { status: 502 });
  }
}
