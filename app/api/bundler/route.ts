import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Server-side proxy for Alchemy's bundler/Gas Manager. Keeps the Alchemy key
// and the gas-sponsorship policy id off the client: the client only ever posts
// JSON-RPC bodies here, and this route stamps them with the real endpoint and
// policy header. Used for the EIP-7702 sponsored transaction flow (see
// lib/trade/sponsor.ts) so transactions never need the wallet to hold gas.
//
// One Gas Manager policy covers every chain listed here, so a new chain is a
// line in this map rather than a second policy.
const ALCHEMY_HOST: Record<string, string> = {
  base: "base-mainnet",
  polygon: "polygon-mainnet",
};

const POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;

// Every JSON-RPC method this flow's viem bundler/public client can call. Kept
// tight so this route can't be used as a general-purpose paid RPC proxy: each
// call spends our Alchemy compute-unit budget, and eth_sendUserOperation spends
// our sponsorship budget too.
const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_call",
  "eth_getTransactionReceipt",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
]);

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defaults to Base so an older client that posts without a chain keeps
  // working through a deploy.
  const chain = req.nextUrl.searchParams.get("chain") ?? "base";
  const host = ALCHEMY_HOST[chain];
  if (!host) {
    return NextResponse.json({ error: "Unsupported chain" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  for (const call of calls) {
    if (!call || typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
    }
  }

  try {
    const res = await fetch(`https://${host}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(POLICY_ID ? { "x-alchemy-policy-id": POLICY_ID } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Base bundler proxy failed:", error);
    return NextResponse.json({ error: "Bundler request failed" }, { status: 502 });
  }
}
