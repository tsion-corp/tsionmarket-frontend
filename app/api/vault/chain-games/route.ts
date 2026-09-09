import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { readChainGames } from "@/lib/server/vault-chain";

// The live Last Man games straight from the contract, read once per instance
// per window for every browser on the lobby. Public chain data; the session
// check only gates use of the read providers.
export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const games = await readChainGames();
    return NextResponse.json(
      { games },
      // Short and shared: the list is the same for everyone, and a browser
      // arriving inside the window should not reach the function at all.
      { headers: { "Cache-Control": "public, s-maxage=8, stale-while-revalidate=30" } }
    );
  } catch (error) {
    console.error("[vault] chain games read failed:", error);
    return NextResponse.json({ error: "Could not read the live games" }, { status: 502 });
  }
}
