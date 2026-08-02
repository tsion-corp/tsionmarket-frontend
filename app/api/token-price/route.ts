import { NextResponse, type NextRequest } from "next/server";

// Spot USD price for a token by contract address, from CoinGecko's contract
// endpoint. Used as a display fallback for catalog assets the backend serves
// without a price (the Solana RWAs today). Five-minute cache: display only,
// quotes price the actual trade.
const REVALIDATE = 300;

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  const address = req.nextUrl.searchParams.get("address");
  if (!platform || !address) return NextResponse.json({ priceUsd: null });

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    platform
  )}/contract/${encodeURIComponent(address)}`;

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return NextResponse.json({ priceUsd: null });
    const data = await res.json();
    const price = data?.market_data?.current_price?.usd;
    return NextResponse.json({
      priceUsd: typeof price === "number" && price > 0 ? price : null,
    });
  } catch (error) {
    console.error("Token price resolve failed:", error);
    return NextResponse.json({ priceUsd: null });
  }
}
