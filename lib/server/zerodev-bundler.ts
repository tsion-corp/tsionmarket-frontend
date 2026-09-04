import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";
import { zeroDevRpcUrl } from "@/lib/server/zerodev";

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);

interface RpcCall {
  method?: unknown;
}

export async function forwardZeroDevBundlerRequest(req: NextRequest, network: string) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = getSponsoredEvmChainByNetwork(network);
  if (!target || !target.gasPolicy) {
    return NextResponse.json({ error: "Unsupported sponsored network" }, { status: 404 });
  }

  const upstream = zeroDevRpcUrl(target.chainId);
  if (!upstream) {
    return NextResponse.json({ error: "ZeroDev sponsorship is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const calls = (Array.isArray(body) ? body : [body]) as Array<RpcCall | null>;
  if (
    calls.length === 0 ||
    calls.length > 100 ||
    calls.some(
      (call) => !call || typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)
    )
  ) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(response.headers.get("retry-after")
          ? { "Retry-After": response.headers.get("retry-after") as string }
          : {}),
      },
    });
  } catch (error) {
    console.error(`ZeroDev bundler proxy failed for ${network}:`, error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut ? "ZeroDev bundler timed out" : "ZeroDev bundler is unavailable",
        provider: "zerodev",
        retryable: true,
      },
      { status: timedOut ? 504 : 502, headers: { "Retry-After": "5" } }
    );
  }
}
