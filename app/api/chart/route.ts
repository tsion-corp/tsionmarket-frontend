import { NextResponse, type NextRequest } from "next/server";
import { coingeckoHeaders, coingeckoUrl } from "@/lib/server/coingecko";
import { fetchLlamaChart } from "@/lib/server/defillama";

const FIVE_MINUTES = 300;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const days = req.nextUrl.searchParams.get("days") ?? "7";
  const type = req.nextUrl.searchParams.get("type") ?? "area";
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
