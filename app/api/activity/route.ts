import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchActivity, isActivityRateLimited } from "@/lib/server/activity";

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
  // A request with no wallet is a malformed request, not a wallet with no
  // history. Answering it with an empty list told the caller its own bug was
  // the truth about someone's account.
  if (!evm && !solana) {
    return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
  }

  try {
    const { items, unavailable } = await fetchActivity(evm, solana);
    return NextResponse.json(
      { items, unavailable },
      {
        headers: {
          // `private`, never `s-maxage`: this is one wallet's data, and a
          // shared cache that stored it would serve it to somebody else. This
          // only lets the USER'S OWN browser skip a duplicate within the
          // window, which is what a second tab and an alt-tab return produce.
          // Kept below the 60s client staleTime so an invalidation cannot be
          // answered from stale bytes, and `fresh=1` carries its own URL so a
          // post-trade read bypasses this entirely.
          //
          // An incomplete read is never stored: the user's retry has to reach
          // the upstream again, not replay the same gap for 30 seconds.
          "Cache-Control": unavailable.length > 0 ? "no-store" : "private, max-age=30",
        },
      }
    );
  } catch (error) {
    console.error("Activity fetch failed:", error);
    if (isActivityRateLimited(error)) {
      return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not load activity" }, { status: 502 });
  }
}
