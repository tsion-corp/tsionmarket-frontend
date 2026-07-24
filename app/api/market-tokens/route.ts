import { NextResponse, type NextRequest } from "next/server";
import { fetchMarketTokens } from "@/lib/server/market-tokens";
import { marketFilter } from "@/lib/market-catalog";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("filter") ?? "popular";
  const filter = marketFilter(key);
  if (!filter) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });

  try {
    const tokens = await fetchMarketTokens(filter.category);
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Market tokens fetch failed:", error);
    return NextResponse.json({ error: "Could not load market tokens" }, { status: 502 });
  }
}
