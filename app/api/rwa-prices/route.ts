import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchRwaPrices, type PriceRequestItem } from "@/lib/server/rwa-prices";

// Batched price lookup for catalog assets the RWA backend serves without one.
// Auth-gated because it spends our Alchemy key, exactly like the portfolio.
const MAX_ITEMS = 120;

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { items?: PriceRequestItem[] } | null;
  const items = (body?.items ?? [])
    .filter((i) => i && typeof i.id === "string" && typeof i.address === "string")
    .slice(0, MAX_ITEMS);
  if (items.length === 0) return NextResponse.json({ prices: {} });

  try {
    return NextResponse.json({ prices: await fetchRwaPrices(items) });
  } catch (error) {
    console.error("RWA price fetch failed:", error);
    // A price is decoration here — the quote prices the trade — so a failure
    // returns nothing rather than breaking the table.
    return NextResponse.json({ prices: {} });
  }
}
