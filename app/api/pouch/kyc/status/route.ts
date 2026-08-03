import { NextResponse, type NextRequest } from "next/server";
import {
  bearerFromRequest,
  PouchConfigError,
  pouchErrorMessage,
  pouchRequest,
} from "@/lib/server/pouch";

// Read the user's current KYC state for a country. Requires the Shared KYC JWT.
// Used to confirm a reused session is still verified before an onramp.
export async function GET(req: NextRequest) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "Not verified" }, { status: 401 });

  const countryCode = req.nextUrl.searchParams.get("countryCode")?.trim() ?? "";
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json({ error: "A valid country is required" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest("/shared-kyc/kyc/status", {
      method: "GET",
      token,
      query: new URLSearchParams({ countryCode }),
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "Could not check your status") },
        { status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch KYC status: not configured");
      return NextResponse.json({ error: "Verification is unavailable right now" }, { status: 500 });
    }
    console.error("Pouch KYC status failed:", error);
    return NextResponse.json({ error: "Could not check your status" }, { status: 502 });
  }
}
