import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  getSponsoredEvmChainByNetwork,
  type SponsoredEvmChainConfig,
} from "@/lib/trade/sponsored-evm";

// Server-side proxy for Pimlico's bundler + paymaster, for networks whose
// registry entry names it as their bundlerProvider (base-mainnet today — see
// docs/plans/2026-11-16-base-sponsorship-via-pimlico-plan.md). Deliberately
// not a copy of alchemy-bundler.ts: there is one key, not a pool, and Pimlico
// speaks the standard ERC-7677 paymaster calls only — no BSO, no Alchemy-only
// one-call method, no rundler_* fee-floor read.
const USER_OPERATION_METHODS = new Set([
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);
const PAYMASTER_METHODS = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData"]);
const MAX_BATCH_CALLS = 100;

interface RpcCall {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

// Pimlico's own context field for scoping a sponsored call to a policy,
// analogous to Alchemy's policyId but a different field name. Optional: a
// key with no policy set sponsors everything on itself.
function withPimlicoPolicy(call: RpcCall, policyId: string): RpcCall {
  if (!PAYMASTER_METHODS.has(call.method)) return call;
  const params = Array.isArray(call.params) ? [...call.params] : [];
  const currentContext = params[3];
  params[3] = {
    ...(currentContext && typeof currentContext === "object" && !Array.isArray(currentContext)
      ? currentContext
      : {}),
    sponsorshipPolicyId: policyId,
  };
  return { ...call, params };
}

function pimlicoUrl(target: SponsoredEvmChainConfig, apiKey: string): string {
  return `https://api.pimlico.io/v2/${target.chainId}/rpc?apikey=${apiKey}`;
}

export async function forwardPimlicoBundlerRequest(req: NextRequest, network: string) {
  const [claims, body] = await Promise.all([
    verifyRequest(req),
    req.json().catch(() => null) as Promise<unknown>,
  ]);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = getSponsoredEvmChainByNetwork(network);
  if (!target?.gasPolicy || target.bundlerProvider !== "pimlico") {
    return NextResponse.json({ error: "Unsupported sponsored network" }, { status: 404 });
  }

  const apiKey = process.env.PIMLICO_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Pimlico API key is missing" }, { status: 503 });
  }

  const calls = (Array.isArray(body) ? body : [body]) as Array<RpcCall | null>;
  if (
    calls.length === 0 ||
    calls.length > MAX_BATCH_CALLS ||
    calls.some(
      (call) => !call || typeof call.method !== "string" || !USER_OPERATION_METHODS.has(call.method)
    )
  ) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
  }

  const policyId = process.env.PIMLICO_SPONSORSHIP_POLICY_ID?.trim();
  const attach = (call: RpcCall | null): RpcCall | null =>
    call && policyId ? withPimlicoPolicy(call, policyId) : call;
  const outgoing = Array.isArray(body) ? calls.map(attach) : attach(calls[0]);

  try {
    const response = await fetch(pimlicoUrl(target, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(outgoing),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn(`Pimlico bundler ${network} answered ${response.status}`, text.slice(0, 300));
    }
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`Pimlico bundler proxy failed for ${network}:`, error);
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      {
        error: timedOut ? "Pimlico bundler timed out" : "Pimlico bundler is unavailable",
        provider: "pimlico",
        retryable: true,
      },
      { status: timedOut ? 504 : 502, headers: { "Retry-After": "5" } }
    );
  }
}
