import { NextResponse } from "next/server";
import { dextopusRequest } from "@/lib/server/dextopus";
import { BUY_ORIGIN, buyableSymbols, type BuyRoute } from "@/lib/buy";
import { swapRouteSymbols } from "@/lib/spot-swap";

/**
 * The symbols this platform can actually trade, as a plain list.
 *
 * Published for Market Square. Its posts are full of `$TICKER`, and a ticker is
 * only worth marking up when tapping it leads somewhere — otherwise a chip
 * promises a trade screen that does not exist. Market Square cannot work that
 * out for itself: the answer comes from Dextopus, behind a key that belongs to
 * this deployment and must not be copied into another one.
 *
 * So Ark answers the question it owns, and hands over the ANSWER rather than
 * the credentials. Nothing here reveals a route, a price or a key: it is the
 * set of strings a post is allowed to make tappable.
 *
 * Public and unauthenticated on purpose. Which coins a platform lists is not a
 * secret — it is on the trade screen — and a signed-out reader sees the same
 * post as everybody else, so the markup must not depend on having a session.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const query = new URLSearchParams({
      originChainId: String(BUY_ORIGIN.chainId),
      originAddress: BUY_ORIGIN.asset,
    });
    const raw = await dextopusRequest("/trade/deposit/destinations", {
      method: "GET",
      purpose: "trade",
      query,
      // Cached upstream too: this is a catalogue, not a price.
      revalidate,
    });
    const rows = (
      Array.isArray(raw) ? raw : ((raw as { data?: unknown })?.data ?? [])
    ) as BuyRoute[];
    const symbols = [...new Set([...buyableSymbols(rows), ...swapRouteSymbols()])].sort();

    return NextResponse.json(
      { symbols },
      {
        headers: {
          // Served from the edge cache for five minutes, and allowed to go
          // stale for an hour while it refreshes. A catalogue that is an hour
          // old marks up the same tickers; an outage that empties it would
          // silently un-link every ticker on the square.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    // Never 500 for this. The caller renders tickers as plain text when the
    // list is empty, which is the correct degradation: no chip beats a chip
    // that leads nowhere. An error here must not take a post render with it.
    return NextResponse.json(
      { symbols: [] },
      { headers: { "Cache-Control": "public, s-maxage=30" } }
    );
  }
}
