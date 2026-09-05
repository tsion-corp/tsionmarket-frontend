import { NextResponse } from "next/server";

// All USD-based FX rates in one call, cached for ten minutes. Public data, no
// auth needed. Two free sources with failover.
const TEN_MINUTES = 600;

async function fromErApi() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    next: { revalidate: TEN_MINUTES },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`er-api failed: ${res.status}`);
  const data = await res.json();
  if (!data?.rates?.NGN) throw new Error("er-api response missing rates");
  return {
    rates: data.rates as Record<string, number>,
    updatedAt: data.time_last_update_utc ?? "",
  };
}

async function fromCurrencyApi() {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    { next: { revalidate: TEN_MINUTES }, signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) throw new Error(`currency-api failed: ${res.status}`);
  const data = await res.json();
  const usd = data?.usd;
  if (!usd) throw new Error("currency-api response missing rates");
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(usd)) {
    rates[code.toUpperCase()] = value as number;
  }
  return { rates, updatedAt: data.date ?? "" };
}

export async function GET() {
  try {
    const data = await fromErApi();
    // Public rates. The client holds these for ten minutes, so the shared
    // cache may too.
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600, max-age=300",
      },
    });
  } catch {
    try {
      const data = await fromCurrencyApi();
      return NextResponse.json(data);
    } catch (error) {
      console.error("FX fetch failed:", error);
      return NextResponse.json({ error: "Could not load rates" }, { status: 502 });
    }
  }
}
