import { NextResponse, type NextRequest } from "next/server";
import { fetchPrices } from "@/lib/server/alchemy";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.getAll("symbols");
  try {
    const prices = await fetchPrices(symbols);
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Prices fetch failed:", error);
    return NextResponse.json({ error: "Could not load prices" }, { status: 502 });
  }
}
