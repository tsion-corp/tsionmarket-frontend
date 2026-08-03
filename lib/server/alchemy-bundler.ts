import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

const POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;
const API_KEY = process.env.ALCHEMY_API_KEY;

// Every JSON-RPC method this flow's viem bundler/public client can call. Kept
// tight so this route cannot become a generic paid RPC proxy.
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

export async function forwardAlchemyBundlerRequest(req: NextRequest, network: string) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = getSponsoredEvmChainByNetwork(network);
  if (!target) {
    return NextResponse.json({ error: "Unsupported sponsored network" }, { status: 404 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "Alchemy API key is missing" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  for (const call of calls) {
    if (!call || typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
    }
  }

  try {
    const res = await fetch(`https://${target.alchemyHost}/v2/${API_KEY}`, {
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
    console.error(`Alchemy bundler proxy failed for ${network}:`, error);
    return NextResponse.json({ error: "Bundler request failed" }, { status: 502 });
  }
}
