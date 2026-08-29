import { NextResponse, type NextRequest } from "next/server";

const FIVE_MINUTES = 300;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const days = req.nextUrl.searchParams.get("days") ?? "7";
  const type = req.nextUrl.searchParams.get("type") ?? "area";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const base = "https://api.coingecko.com/api/v3";
  const url =
    type === "candles"
      ? `${base}/coins/${id}/ohlc?vs_currency=usd&days=${days}`
      : `${base}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  try {
    const res = await fetch(url, {
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
    return NextResponse.json({ points });
  } catch (error) {
    console.error("Chart fetch failed:", error);
    return NextResponse.json({ error: "Could not load chart" }, { status: 502 });
  }
}
