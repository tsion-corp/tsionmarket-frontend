import { NextResponse, type NextRequest } from "next/server";
import { fetchOndoMarkets } from "@/lib/server/ondo";
import { ONDO_PRODUCT_IDS } from "@/lib/ondo";

// Defaults to the Ondo product ids. The markets view passes its own `ids` to
// reuse the same CoinGecko proxy for tokenized equities, gold and treasuries.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.getAll("ids");
  const ids =
    raw.length > 0 ? raw.flatMap((value) => value.split(",")).filter(Boolean) : ONDO_PRODUCT_IDS;

  try {
    const markets = await fetchOndoMarkets(ids);
    return NextResponse.json({ markets });
  } catch (error) {
    console.error("Ondo markets fetch failed:", error);
    return NextResponse.json({ error: "Could not load Ondo markets" }, { status: 502 });
  }
}
