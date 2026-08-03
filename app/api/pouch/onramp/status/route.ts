import { NextResponse, type NextRequest } from "next/server";
import { PouchConfigError, pouchErrorMessage, pouchRequest } from "@/lib/server/pouch";
import { normalizeOnrampStatusResult } from "@/lib/pouch/onramp";

// Poll an onramp's settlement status by its Pouch session id. The client calls
// this while the bank transfer is pending; a terminal status stops the polling.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  // Session ids are provider tokens; keep the lookup to a safe character set.
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(sessionId)) {
    return NextResponse.json({ error: "A valid session is required" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest(`/v2/sessions/${sessionId}`, { method: "GET" });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "Could not check the transfer") },
        { status }
      );
    }
    return NextResponse.json(normalizeOnrampStatusResult(data));
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch onramp status: not configured");
      return NextResponse.json(
        { error: "Bank transfer is unavailable right now" },
        { status: 500 }
      );
    }
    console.error("Pouch onramp status failed:", error);
    return NextResponse.json({ error: "Could not check the transfer" }, { status: 502 });
  }
}
