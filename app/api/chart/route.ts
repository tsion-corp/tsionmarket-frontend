import { NextResponse, type NextRequest } from "next/server";
import { coingeckoHeaders, coingeckoUrl } from "@/lib/server/coingecko";
import { fetchLlamaChart } from "@/lib/server/defillama";
import { fetchPoolCandles } from "@/lib/server/geckoterminal";

const FIVE_MINUTES = 300;

// The chart series is the same for everyone who asks, so it is cached at the
// edge rather than fetched per reader. That is what makes a keyless upstream
// viable: GeckoTerminal allows roughly ten calls a minute shared across every
// user by IP, so the number that matters is cache misses, not page views.
// Implements W4 of ADR-2026-09-08-frontend-caching-and-request-reduction, which
// names this handler; the failure branch carries the same directive so a miss
// is not re-asked on every render either.
const CACHE_CONTROL = `public, s-maxage=${FIVE_MINUTES}, stale-while-revalidate=${FIVE_MINUTES * 2}`;

function points(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": CACHE_CONTROL } });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const days = req.nextUrl.searchParams.get("days") ?? "7";
  const type = req.nextUrl.searchParams.get("type") ?? "area";

  // A pool, when the caller has one. Charted from the DEX rather than from a
  // listing, which is the only way a token CoinGecko has never listed gets a
  // chart at all. `chain` and `token` come with it: the pool has two sides and
  // the token names which one is being charted.
  const chain = req.nextUrl.searchParams.get("chain");
  const pool = req.nextUrl.searchParams.get("pool");
  const token = req.nextUrl.searchParams.get("token");
  if (chain && pool && token) {
    try {
      const candles = await fetchPoolCandles(
        chain,
        pool,
        token,
        days,
        type === "candles" ? "candles" : "area"
      );
      if (candles) return points({ points: candles });
    } catch (error) {
      console.error("GeckoTerminal chart failed:", error);
    }
    // A pool that answered nothing falls through to the listing sources below
    // when an id was sent too, rather than failing outright.
    if (!id) {
      return NextResponse.json(
        { error: "Could not load chart" },
        { status: 502, headers: { "Cache-Control": CACHE_CONTROL } }
      );
    }
  }

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const path =
    type === "candles"
      ? `/coins/${id}/ohlc?vs_currency=usd&days=${days}`
      : `/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  try {
    const res = await fetch(coingeckoUrl(path), {
      headers: coingeckoHeaders(),
      next: { revalidate: FIVE_MINUTES },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
    const data = await res.json();

    if (type === "candles") {
      const points = (data as number[][]).map(([ts, open, high, low, close]) => ({
        time: Math.floor(ts / 1000),
        open,
        high,
        low,
        close,
      }));
      return NextResponse.json({ points });
    }

    const points = (data.prices as number[][]).map(([ts, value]) => ({
      time: Math.floor(ts / 1000),
      value,
    }));
    if (points.length === 0) throw new Error("CoinGecko returned no points");
    return NextResponse.json({ points });
  } catch (error) {
    // DefiLlama serves prices, not candles, so it can only stand in for an area
    // chart. Building candles from single prices would invent the open and high.
    if (type !== "candles") {
      try {
        const points = await fetchLlamaChart(id, days);
        if (points) return NextResponse.json({ points });
      } catch (fallbackError) {
        console.error("DefiLlama chart fallback failed:", fallbackError);
      }
    }
    console.error("Chart fetch failed:", error);
    return NextResponse.json({ error: "Could not load chart" }, { status: 502 });
  }
}
