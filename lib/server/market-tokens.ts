import "server-only";
import type { MarketToken } from "@/lib/market-catalog";

// CoinGecko /coins/markets proxy for the Markets explorer. Public data, no key.
// Cached five minutes to stay inside the free rate limit.
const FIVE_MINUTES = 300;

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h?: number | null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchMarketTokens(category: string | null): Promise<MarketToken[]> {
  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: "100",
    page: "1",
    price_change_percentage: "24h",
  });
  if (category) params.set("category", category);
  const url = `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;

  // CoinGecko's free tier rate-limits (429) under rapid chain switching, so
  // retry a couple of times before surfacing an error, and never let a non-array
  // (error) body throw.
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate: FIVE_MINUTES } });
      if (res.ok) {
        const data = await res.json();
        const rows = (Array.isArray(data) ? data : []) as CoinGeckoMarket[];
        return rows.map((r) => ({
          id: r.id,
          symbol: (r.symbol ?? "").toUpperCase(),
          name: r.name ?? "",
          logo: r.image ?? null,
          priceUsd: r.current_price ?? 0,
          change24h: r.price_change_percentage_24h ?? 0,
          marketCap: r.market_cap ?? 0,
        }));
      }
      lastError = new Error(`CoinGecko markets failed: ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500 * (attempt + 1));
  }
  throw lastError;
}
