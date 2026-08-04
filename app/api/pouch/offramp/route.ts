import { NextResponse, type NextRequest } from "next/server";
import {
  bearerFromRequest,
  PouchConfigError,
  pouchErrorMessage,
  pouchRequest,
} from "@/lib/server/pouch";
import {
  isValidAccountNumber,
  normalizeOfframpCreation,
  OFFRAMP,
  OFFRAMP_MIN_USDC,
} from "@/lib/pouch/offramp";

// Create a Naira offramp for a verified user. Pouch returns a one-off Base
// address; the client sends `cryptoAmount` USDC there and Pouch pays the bank.
// Authorized with the Shared KYC JWT, so no identity is re-collected.
export async function POST(req: NextRequest) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "Not verified" }, { status: 401 });

  let body: {
    cryptoAmount?: unknown;
    bankAccount?: { networkId?: unknown; accountNumber?: unknown; accountName?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cryptoAmount =
    typeof body.cryptoAmount === "number" ? body.cryptoAmount : Number(body.cryptoAmount);
  const bank = body.bankAccount ?? {};
  const networkId = typeof bank.networkId === "string" ? bank.networkId.trim() : "";
  const accountNumber = typeof bank.accountNumber === "string" ? bank.accountNumber.trim() : "";
  const accountName = typeof bank.accountName === "string" ? bank.accountName.trim() : "";

  if (!Number.isFinite(cryptoAmount) || cryptoAmount < OFFRAMP_MIN_USDC) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  if (!networkId) return NextResponse.json({ error: "Select a bank" }, { status: 400 });
  if (!isValidAccountNumber(accountNumber)) {
    return NextResponse.json({ error: "A valid account number is required" }, { status: 400 });
  }

  const payload = {
    cryptoAmount,
    currency: OFFRAMP.currency,
    cryptoCurrency: OFFRAMP.cryptoCurrency,
    cryptoNetwork: OFFRAMP.cryptoNetwork,
    countryCode: OFFRAMP.countryCode,
    bankAccount: { networkId, accountNumber, accountName },
  };

  try {
    const { status, data } = await pouchRequest("/shared-kyc/ramp/offramp", {
      method: "POST",
      token,
      body: payload,
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "We couldn't set up the withdrawal") },
        { status }
      );
    }
    return NextResponse.json(normalizeOfframpCreation(data));
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch offramp create: not configured");
      return NextResponse.json({ error: "Withdrawals are unavailable right now" }, { status: 500 });
    }
    console.error("Pouch offramp create failed:", error);
    return NextResponse.json({ error: "Could not set up the withdrawal" }, { status: 502 });
  }
}
