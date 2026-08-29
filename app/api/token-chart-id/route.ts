import { NextResponse, type NextRequest } from "next/server";

// Resolves a token's CoinGecko coin id from its contract address, so a market
// the top-coins feed doesn't cover can still be charted. The mapping is stable,
// so cache it for a day. Any miss or error returns { id: null }, and the caller
// falls back to its own "no chart" state without failing the request.
const ONE_DAY = 86_400;

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  const address = req.nextUrl.searchParams.get("address");
  if (!platform || !address) return NextResponse.json({ id: null });

  const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(
    address
  )}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: ONE_DAY },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return NextResponse.json({ id: null });
    const data = await res.json();
    return NextResponse.json({ id: typeof data?.id === "string" ? data.id : null });
  } catch (error) {
    console.error("Token chart-id resolve failed:", error);
    return NextResponse.json({ id: null });
  }
}
