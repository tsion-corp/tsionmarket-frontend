import "server-only";
import type { OndoMarket } from "@/lib/ondo";

// CoinGecko markets proxy. One call returns live price, 24h and 1y change, and
// market cap for a set of coin ids. Public data, no key needed. Cached for five
// minutes to stay inside the free CoinGecko rate limit.

const FIVE_MINUTES = 300;

// Shape of the CoinGecko /coins/markets rows we consume. Narrowed at this seam
// so nothing untyped leaks past the service.
interface CoinGeckoMarket {
  id: string;
  symbol: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
}

export async function fetchOndoMarkets(ids: string[]): Promise<OndoMarket[]> {
  if (ids.length === 0) return [];

  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: ids.join(","),
    price_change_percentage: "24h,1y",
    per_page: String(ids.length),
  });

  const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`, {
    next: { revalidate: FIVE_MINUTES },
  });
  if (!res.ok) throw new Error(`CoinGecko markets failed: ${res.status}`);

  const rows = (await res.json()) as CoinGeckoMarket[];
  return rows.map((row) => ({
    id: row.id,
    symbol: (row.symbol ?? "").toUpperCase(),
    logo: row.image ?? null,
    priceUsd: row.current_price ?? 0,
    change24h: row.price_change_percentage_24h_in_currency ?? 0,
    change1y: row.price_change_percentage_1y_in_currency ?? null,
    marketCap: row.market_cap ?? 0,
  }));
}
