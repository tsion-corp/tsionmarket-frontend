import { NextResponse, type NextRequest } from "next/server";
import { fetchMarketTokens } from "@/lib/server/market-tokens";
import { marketFilter } from "@/lib/market-catalog";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("filter") ?? "popular";
  const filter = marketFilter(key);
  if (!filter) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });

  try {
    const tokens = await fetchMarketTokens(filter.category);
    // Public list, same for every caller. Sent anonymously by the client so a
    // shared cache can hold it.
    return NextResponse.json(
      { tokens },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600, max-age=60",
        },
      }
    );
  } catch (error) {
    console.error("Market tokens fetch failed:", error);
    return NextResponse.json({ error: "Could not load market tokens" }, { status: 502 });
  }
}
