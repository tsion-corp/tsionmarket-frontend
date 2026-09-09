import "server-only";
import {
  alchemyPairs,
  isAlchemyKeyBlocked,
  markAlchemyKeyBlocked,
  MONTHLY_CAPACITY_COOLDOWN_MS,
  RATE_LIMIT_COOLDOWN_MS,
  type AlchemyPair,
} from "@/lib/server/alchemy-keys";
import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  getSponsoredEvmChainByNetwork,
  type SponsoredEvmChainConfig,
} from "@/lib/trade/sponsored-evm";

const USER_OPERATION_METHODS = new Set([
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  // Gas limits, fees and paymaster data in one answer; the send path's only
  // sponsorship call (ADR-2026-09-09-one-call-sponsorship).
  "alchemy_requestGasAndPaymasterAndData",
  // The bundler's priority-fee floor, which the paymaster path reads before
  // sending; the chain's own estimate is 0 on Arbitrum and gets rejected.
  "rundler_maxPriorityFeePerGas",
]);
const SPONSORED_SEND_METHOD = "eth_sendUserOperation";
const GAS_AND_PAYMASTER_METHOD = "alchemy_requestGasAndPaymasterAndData";
const PAYMASTER_METHODS = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  GAS_AND_PAYMASTER_METHOD,
]);
const MAX_BATCH_CALLS = 100;

// What Alchemy answers, with a 429, once the account owning the key has used
// its monthly capacity. Unlike a throughput limit this does not clear on a
// retry; it clears on the next billing cycle or a plan change.
// Two wordings for the same condition: the app's monthly capacity is used
// up (a 429), or the Gas Manager policy has reached its sponsorship spend
// limit (a 200 carrying a JSON-RPC error, seen live 2026-09-09). Neither
// clears on a retry; both clear on the dashboard.
const MONTHLY_CAPACITY_EXHAUSTED =
  /monthly capacity limit exceeded|over your gas sponsorship limit/i;

// JSON-RPC "resource unavailable". viem retries 429s, LimitExceeded (-32005)
// and Internal (-32603); it surfaces this one at once, which is what an
// exhausted month deserves: four rapid retries cannot change the answer.
const RESOURCE_UNAVAILABLE = -32002;

const SPONSORSHIP_EXHAUSTED_MESSAGE =
  "Gas sponsorship is out of monthly capacity on the sponsoring account; sponsored transactions are paused until it is restored.";

// One JSON-RPC error per call the client sent, under the ids it sent, so a
// batch gets a batch back.
// A JSON-RPC error inside a 2xx is how the bundler reports a rejected user
// operation, a paymaster refusal or a simulation revert. Relayed silently,
// the only record of why a sponsored send failed was a toast in one user's
// browser. Logged here with the method it answered, the code and the message;
// no addresses, no calldata.
function logRpcErrors(network: string, calls: Array<RpcCall | null>, text: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  const methodById = new Map<string, string>();
  for (const call of calls) if (call) methodById.set(String(call.id ?? ""), call.method);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  for (const entry of entries) {
    const error = (entry as { id?: unknown; error?: { code?: unknown; message?: unknown } })?.error;
    if (!error) continue;
    const id = String((entry as { id?: unknown }).id ?? "");
    const method = methodById.get(id) ?? calls[0]?.method ?? "unknown";
    console.warn(
      `Alchemy bundler ${network}: ${method} answered an error`,
      typeof error.code === "number" ? error.code : null,
      typeof error.message === "string" ? error.message.slice(0, 300) : ""
    );
  }
}

function exhaustedBody(calls: Array<RpcCall | null>, batch: boolean): unknown {
  const entries = calls.map((call) => ({
    jsonrpc: "2.0",
    id: call?.id ?? null,
    error: { code: RESOURCE_UNAVAILABLE, message: SPONSORSHIP_EXHAUSTED_MESSAGE },
  }));
  return batch ? entries : entries[0];
}

interface RpcCall {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

// A Gas Manager policy belongs to the Alchemy app that created it, so a key
// is only ever sent with the policy at its own index (ADR-2026-09-07-alchemy-
// key-pool). The pairs that can sponsor this network, in configured order,
// the ones on cooldown last: Polygon keeps its own policy list, every other
// paymaster network uses the shared one.
//
// There used to be an ALCHEMY_GAS_MANAGER_API_KEY read ahead of the key, for
// a policy-owning key on a separate account. It was preferred silently, so
// when that account ran out of monthly capacity, rotating the key fixed
// nothing. The pairing by index is what makes the indirection safe now.
function sponsorPairsFor(
  target: SponsoredEvmChainConfig
): Array<AlchemyPair & { policyId: string }> {
  const pairs = alchemyPairs()
    .map((pair) => ({
      ...pair,
      policyId: target.network === "polygon-mainnet" ? pair.polygonPolicyId : pair.policyId,
    }))
    .filter((pair): pair is AlchemyPair & { policyId: string } => Boolean(pair.policyId));
  return [
    ...pairs.filter((pair) => !isAlchemyKeyBlocked(pair.key)),
    ...pairs.filter((pair) => isAlchemyKeyBlocked(pair.key)),
  ];
}

// Answers that mean "this pair cannot sponsor right now, the next may": the
// app is over capacity or rate limited, the key is refused, or the app does
// not own the policy. Anything else is the request's own outcome.
// A bundler-sponsorship policy answers the paymaster path "Unsupported Policy
// Type"; that pair can never serve this path, the same as a missing policy.
const PAIR_REJECTED =
  /policy not found|policy id\(s\) not found|unsupported policy type|must be authenticated|not authorized|unauthorized|invalid api key/i;

function pairCannotServe(status: number, text: string): "capacity" | "rejected" | null {
  if ((status === 429 || status === 200) && MONTHLY_CAPACITY_EXHAUSTED.test(text)) {
    return "capacity";
  }
  if (status === 429 || status === 401 || status === 403) return "rejected";
  if (status === 200 && PAIR_REJECTED.test(text)) return "rejected";
  return null;
}

// The policy rides in the paymaster context for the pm_* pair and at the top
// of the single request object for the Gas Manager call. Whatever the client
// sent in that slot is replaced: the policy is the server's to choose.
function withPaymasterPolicy(call: RpcCall, policyId: string): RpcCall {
  if (!PAYMASTER_METHODS.has(call.method)) return call;

  const params = Array.isArray(call.params) ? [...call.params] : [];
  if (call.method === GAS_AND_PAYMASTER_METHOD) {
    const request = params[0];
    params[0] = {
      ...(request && typeof request === "object" && !Array.isArray(request) ? request : {}),
      policyId,
    };
    return { ...call, params };
  }
  const currentContext = params[3];
  params[3] = {
    ...(currentContext && typeof currentContext === "object" && !Array.isArray(currentContext)
      ? currentContext
      : {}),
    policyId,
  };
  return { ...call, params };
}

export async function forwardAlchemyBundlerRequest(req: NextRequest, network: string) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = getSponsoredEvmChainByNetwork(network);
  if (!target?.gasPolicy) {
    return NextResponse.json({ error: "Unsupported sponsored network" }, { status: 404 });
  }

  // The list itself, not the deprecated fallback: a fallback-only setup has
  // no policy and could never sponsor.
  if (!process.env.ALCHEMY_API_KEY?.trim()) {
    return NextResponse.json({ error: "Alchemy API key is missing" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
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

  const needsPolicy =
    (target.sponsorshipMode === "paymaster" &&
      calls.some((call) => Boolean(call && PAYMASTER_METHODS.has(call.method)))) ||
    (target.sponsorshipMode === "bso" &&
      calls.some((call) => call?.method === SPONSORED_SEND_METHOD));

  // A call that carries no policy (a plain estimate or a receipt lookup) can
  // go to any key; one that sponsors must go to a key with a policy.
  const pairs = needsPolicy
    ? sponsorPairsFor(target)
    : alchemyPairs().map((pair) => ({ ...pair, policyId: pair.policyId ?? "" }));
  if (pairs.length === 0) {
    return NextResponse.json(
      { error: `Gas sponsorship policy for ${network} is missing` },
      { status: needsPolicy ? 424 : 503 }
    );
  }

  const bodyFor = (policyId: string): unknown => {
    const attach = (call: RpcCall | null): RpcCall | null =>
      call && target.sponsorshipMode === "paymaster" && policyId
        ? withPaymasterPolicy(call, policyId)
        : call;
    return Array.isArray(body) ? calls.map(attach) : attach(calls[0]);
  };

  try {
    let last: { response: Response; text: string } | null = null;
    // A pair that is misconfigured (no policy, wrong type) could never have
    // served; if any pair that could serve is out of capacity, capacity is
    // the true reason nothing sponsored.
    let anyExhausted = false;
    for (const pair of pairs) {
      const response = await fetch(`https://${target.alchemyHost}/v2/${pair.key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(target.sponsorshipMode === "bso" && needsPolicy
            ? { "x-alchemy-policy-id": pair.policyId }
            : {}),
        },
        body: JSON.stringify(bodyFor(pair.policyId)),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      const text = await response.text();
      const verdict = pairCannotServe(response.status, text);
      if (verdict === null) {
        logRpcErrors(network, calls, text);
        return new NextResponse(text, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...(response.headers.get("retry-after")
              ? { "Retry-After": response.headers.get("retry-after") as string }
              : {}),
          },
        });
      }
      // This pair is out; remember it so the next request starts past it,
      // and let the next pair try with its own policy.
      markAlchemyKeyBlocked(
        pair.key,
        verdict === "capacity" ? MONTHLY_CAPACITY_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS
      );
      if (verdict === "capacity") anyExhausted = true;
      console.warn(
        `Alchemy sponsorship for ${network}: pair ${pair.index} ${verdict}, trying the next`,
        text.slice(0, 200)
      );
      last = { response, text };
    }

    if (!last) throw new Error("No Alchemy pair could be tried");
    if (anyExhausted) {
      // The one condition here that is an operations alarm, not weather: no
      // sponsored transaction will succeed until an Alchemy app behind the
      // pool has capacity again. Logged so it is seen, and answered in a form
      // the client shows honestly instead of retrying.
      console.error(
        `Alchemy sponsorship for ${network}: sponsorship capacity exhausted on every account that could serve`,
        last.text.slice(0, 300)
      );
      return NextResponse.json(exhaustedBody(calls, Array.isArray(body)), {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
    // Every pair refused for a reason other than capacity: pass the last
    // answer through so the client sees the real error.
    logRpcErrors(network, calls, last.text);
    return new NextResponse(last.text, {
      status: last.response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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
