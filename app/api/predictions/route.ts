import { NextResponse } from "next/server";
import { fetchPredictions } from "@/lib/server/polymarket";

export async function GET() {
  try {
    const predictions = await fetchPredictions();
    return NextResponse.json({ predictions });
  } catch (error) {
    console.error("Predictions fetch failed:", error);
    return NextResponse.json({ error: "Could not load prediction markets" }, { status: 502 });
  }
}
