import { NextResponse, type NextRequest } from "next/server";
import {
  bearerFromRequest,
  PouchConfigError,
  pouchErrorMessage,
  pouchRequest,
} from "@/lib/server/pouch";
import {
  isValidOnrampAmount,
  normalizeOnrampCreation,
  ONRAMP_FIAT,
  ONRAMP_SETTLEMENT,
} from "@/lib/pouch/onramp";

// Create a Naira onramp for an already-verified user. The Shared KYC JWT stands
// in for the KYC block, so no identity is re-collected: Pouch returns a one-off
// bank account and settles crypto to the wallet address we send. `amount` is the
// USD value to receive; Pouch quotes the exact Naira to pay.
export async function POST(req: NextRequest) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "Not verified" }, { status: 401 });

  let body: { amountUsd?: unknown; walletAddress?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
  if (!isValidOnrampAmount(amountUsd)) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  // Settlement is USDC on Base, so the destination is an EVM address.
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "A valid wallet address is required" }, { status: 400 });
  }

  const payload = {
    // Pouch prices from a USD amount and converts to the local payout currency.
    amount: amountUsd,
    currency: ONRAMP_FIAT.amountCurrency,
    countryCode: ONRAMP_FIAT.countryCode,
    cryptoCurrency: ONRAMP_SETTLEMENT.cryptoCurrency,
    cryptoNetwork: ONRAMP_SETTLEMENT.cryptoNetwork,
    walletAddress,
  };

  try {
    const { status, data } = await pouchRequest("/shared-kyc/ramp/onramp", {
      method: "POST",
      token,
      body: payload,
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "We couldn't set up the transfer") },
        { status }
      );
    }
    return NextResponse.json(normalizeOnrampCreation(data));
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch onramp create: not configured");
      return NextResponse.json(
        { error: "Bank transfer is unavailable right now" },
        { status: 500 }
      );
    }
    console.error("Pouch onramp create failed:", error);
    return NextResponse.json({ error: "Could not set up the transfer" }, { status: 502 });
  }
}
