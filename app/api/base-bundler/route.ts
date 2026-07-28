import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Server-side proxy for Alchemy's Base bundler/Gas Manager. Keeps the Alchemy
// key and the gas-sponsorship policy id off the client: the client only ever
// posts JSON-RPC bodies here, and this route stamps them with the real
// endpoint and policy header. Used for the EIP-7702 sponsored transaction flow
// (see lib/trade/base-sponsor.ts) so Base transactions (RWA buys/sells, vault
// wagers) never need the wallet to hold ETH.
const ALCHEMY_URL = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
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

  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  for (const call of calls) {
    if (!call || typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
    }
  }

  try {
    const res = await fetch(ALCHEMY_URL, {
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
