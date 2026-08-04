import { NextResponse, type NextRequest } from "next/server";
import { PouchConfigError, pouchErrorMessage, pouchRequest } from "@/lib/server/pouch";
import { normalizeVerifiedBank, POUCH_PROVIDER_ID } from "@/lib/pouch/offramp";
import { ONRAMP_FIAT } from "@/lib/pouch/onramp";

// Confirm a bank account exists and resolve the real account-holder name before
// an offramp is created. Public on Pouch's side; proxied so the partner key and
// the provider id are attached server-side.
export async function POST(req: NextRequest) {
  let body: { accountNumber?: unknown; networkId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const networkId = typeof body.networkId === "string" ? body.networkId.trim() : "";
  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json({ error: "Enter a valid 10-digit account number" }, { status: 400 });
  }
  if (!networkId) {
    return NextResponse.json({ error: "Select a bank" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest("/shared-kyc/ramp/verify-bank", {
      method: "POST",
      body: {
        accountNumber,
        networkId,
        countryCode: ONRAMP_FIAT.countryCode,
        providerId: POUCH_PROVIDER_ID,
      },
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "We couldn't verify that account") },
        { status }
      );
    }
    return NextResponse.json(normalizeVerifiedBank(data));
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch verify-bank: not configured");
      return NextResponse.json({ error: "Withdrawals are unavailable right now" }, { status: 500 });
    }
    console.error("Pouch verify-bank failed:", error);
    return NextResponse.json({ error: "Could not verify the account" }, { status: 502 });
  }
}
