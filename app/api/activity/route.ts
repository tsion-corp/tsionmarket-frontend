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
    return NextResponse.json(
      { items: await fetchActivity(evm, solana) },
      {
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
      }
    );
  } catch (error) {
    console.error("Activity fetch failed:", error);
    if (isRateLimitError(error)) {
      return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not load activity" }, { status: 502 });
  }
}
