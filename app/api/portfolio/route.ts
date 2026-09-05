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
  // A caller that just traded needs to observe its own effect; the short shared
  // cache would otherwise hand back the pre-trade snapshot.
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  try {
    const portfolio = await fetchPortfolio(evm, solana, fresh);
    return NextResponse.json(portfolio, {
      headers: {
        // `private`, never `s-maxage`: this is one wallet's data, and a
        // shared cache that stored it would serve it to somebody else. This
        // only lets the USER'S OWN browser skip a duplicate within the
        // window, which is what a second tab and an alt-tab return produce.
        // Kept below the 60s client staleTime so an invalidation cannot be
        // answered from stale bytes, and `fresh=1` carries its own URL so a
        // post-trade read bypasses this entirely.
        "Cache-Control": "private, max-age=30",
      },
    });
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
