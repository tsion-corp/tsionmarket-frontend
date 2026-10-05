import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchRwaMarket, type PriceRequestItem } from "@/lib/server/rwa-prices";
import { isCatalogAsset } from "@/lib/server/rwa-registry";

// Batched market lookup (price, 24h change, liquidity, market cap) for catalog
// assets the RWA backend serves thin. It spends our Alchemy key, so signed-out
// callers only get catalogue assets.
const MAX_ITEMS = 120;

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  const body = (await req.json().catch(() => null)) as { items?: PriceRequestItem[] } | null;
  const items = (body?.items ?? [])
    .filter((i) => i && typeof i.id === "string" && typeof i.address === "string")
    .slice(0, MAX_ITEMS);
  const allowed = claims
    ? items
    : (
        await Promise.all(
          items.map(async (item) =>
            (await isCatalogAsset(item.chain, item.address)) ? item : null
          )
        )
      ).filter((item): item is PriceRequestItem => item !== null);
  if (allowed.length === 0) return NextResponse.json({ market: {} });

  try {
    return NextResponse.json({ market: await fetchRwaMarket(allowed) });
  } catch (error) {
    console.error("RWA market fetch failed:", error);
    // These stats are decoration — the quote prices the trade — so a failure
    // returns nothing rather than breaking the table.
    return NextResponse.json({ market: {} });
  }
}
