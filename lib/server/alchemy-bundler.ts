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

const SPONSORED_SEND_METHOD = "eth_sendUserOperation";

interface RpcCall {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

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
  const calls = (Array.isArray(body) ? body : [body]) as Array<RpcCall | null>;
  for (const call of calls) {
    if (!call || typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
    }
  }
  const needsPolicy = calls.some((call) => call?.method === SPONSORED_SEND_METHOD);
  if (needsPolicy && !POLICY_ID) {
    return NextResponse.json({ error: "Alchemy gas policy is missing" }, { status: 503 });
  }

  try {
    const res = await fetch(`https://${target.alchemyHost}/v2/${API_KEY}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(needsPolicy && POLICY_ID ? { "x-alchemy-policy-id": POLICY_ID } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": "no-store",
        ...(res.headers.get("retry-after")
          ? { "Retry-After": res.headers.get("retry-after") as string }
          : {}),
      },
    });
  } catch (error) {
    console.error(`Alchemy bundler proxy failed for ${network}:`, error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut ? "Alchemy bundler timed out" : "Alchemy bundler is unavailable",
        provider: "alchemy",
        retryable: true,
      },
      { status: timedOut ? 504 : 502, headers: { "Retry-After": "5" } }
    );
  }
}
