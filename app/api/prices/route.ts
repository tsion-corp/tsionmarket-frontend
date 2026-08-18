import { NextResponse, type NextRequest } from "next/server";
import { fetchPrices, isRateLimitError } from "@/lib/server/alchemy";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.getAll("symbols");
  try {
    const prices = await fetchPrices(symbols);
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Prices fetch failed:", error);
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: "Too many requests, try again shortly" },
        { status: 429, headers: { "Retry-After": "30" } }
      );
    }
    return NextResponse.json({ error: "Could not load prices" }, { status: 502 });
  }
}
