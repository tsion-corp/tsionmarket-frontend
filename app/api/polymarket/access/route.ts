import { NextResponse, type NextRequest } from "next/server";
import { isBlockedCountry } from "@/lib/polymarket/restricted";

// Region gate for prediction trading. Reads the edge-provided country code
// (Vercel sets x-vercel-ip-country) and reports eligibility. No auth needed — it
// returns only a boolean, never anything sensitive.
export async function GET(req: NextRequest) {
  const country = req.headers.get("x-vercel-ip-country") ?? req.headers.get("x-country") ?? null;
  return NextResponse.json({ country, allowed: !isBlockedCountry(country) });
}
