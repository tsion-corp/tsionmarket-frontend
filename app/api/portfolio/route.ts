import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchPortfolio, isRateLimitError } from "@/lib/server/alchemy";

// Balances are public on-chain data. The auth check only gates use of our
// Alchemy key. The client passes its own embedded wallet addresses.
export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const evm = req.nextUrl.searchParams.get("evm") ?? undefined;
  const solana = req.nextUrl.searchParams.get("solana") ?? undefined;

  try {
    const portfolio = await fetchPortfolio(evm, solana);
    return NextResponse.json(portfolio);
  } catch (error) {
    console.error("Portfolio fetch failed:", error);
    // Preserve the rate-limit signal so the client's retry guard sees it and
    // backs off immediately instead of retrying into an already-throttled key.
    if (isRateLimitError(error)) {
      return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not load balances" }, { status: 502 });
  }
}
