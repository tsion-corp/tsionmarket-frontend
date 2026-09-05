import { NextResponse, type NextRequest } from "next/server";
import { fetchPrices, isRateLimitError } from "@/lib/server/alchemy";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.getAll("symbols");
  try {
    const prices = await fetchPrices(symbols);
    // Public and identical for everyone who asks for the same symbols, so a
    // shared cache can serve it: one upstream call covers every user in the
    // window instead of one per user per poll. This only works because the
    // client sends this read anonymously; a request carrying an Authorization
    // header is private by definition and no CDN will store it.
    return NextResponse.json(
      { prices },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300, max-age=30",
        },
      }
    );
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
