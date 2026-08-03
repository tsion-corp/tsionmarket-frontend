import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { CHAIN_TO_ALCHEMY_NETWORK, fetchTokenHistory } from "@/lib/server/token-history";

// Price history for one RWA, for the detail sheet chart. The RWA backend only
// serves yield history, and only for the three yield-bearing assets, so an
// equity or a metal would otherwise have no chart at all.
// Auth-gated because it spends our Alchemy key, exactly like the portfolio.

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidAddress(chain: string, address: string): boolean {
  return chain === "solana" ? SOLANA_ADDRESS.test(address) : EVM_ADDRESS.test(address);
}

export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chain = req.nextUrl.searchParams.get("chain") ?? "";
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!CHAIN_TO_ALCHEMY_NETWORK[chain] || !isValidAddress(chain, address)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ points: await fetchTokenHistory(chain, address) });
}
