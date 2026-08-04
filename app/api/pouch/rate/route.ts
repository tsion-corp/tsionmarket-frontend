import { NextResponse } from "next/server";
import { PouchConfigError, pouchErrorMessage, pouchRequest } from "@/lib/server/pouch";
import { normalizePouchRate, ONRAMP_FIAT } from "@/lib/pouch/onramp";

// Pouch's live onramp rate (Naira per USD, BUY side). The amount-entry screen
// uses it so the USD estimate matches what the transfer will actually cost. The
// rate is amount-independent, so we query a reference amount and return the rate.
const REFERENCE_NGN = 100000;

export async function GET() {
  const query = new URLSearchParams({
    amount: String(REFERENCE_NGN),
    fromCurrency: ONRAMP_FIAT.localCurrency,
    toCurrency: ONRAMP_FIAT.amountCurrency,
    countryCode: ONRAMP_FIAT.countryCode,
    type: "BUY",
  });

  try {
    const { status, data } = await pouchRequest("/crypto/rate", { method: "GET", query });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "Could not load the rate") },
        { status }
      );
    }
    const rate = normalizePouchRate(data);
    if (rate == null) {
      return NextResponse.json({ error: "Could not load the rate" }, { status: 502 });
    }
    return NextResponse.json({ rate });
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch rate: not configured");
      return NextResponse.json({ error: "Rate is unavailable right now" }, { status: 500 });
    }
    console.error("Pouch rate failed:", error);
    return NextResponse.json({ error: "Could not load the rate" }, { status: 502 });
  }
}
