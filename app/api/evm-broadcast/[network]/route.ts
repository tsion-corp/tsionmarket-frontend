import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  MAX_RAW_BYTES,
  RATE_LIMIT_PER_MINUTE,
  RateLimiter,
  broadcastRpcUrl,
  inspectRawTransaction,
  senderCheck,
} from "@/lib/server/evm-broadcast";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

// Broadcasts a transaction the self-custody wallet signed in the browser. Read
// lib/server/evm-broadcast.ts for the rules; the short version is that it can only
// send a signed transaction, for this network, from an address this caller's own
// wallet is registered with, and only where an operator switched the network on.

const limiter = new RateLimiter(RATE_LIMIT_PER_MINUTE, 60_000);

function refuse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const claims = await verifyRequest(req);
  // Decane sessions only: a Privy token is on its way out and must not reach a wallet.
  if (!claims || claims.provider !== "decane")
    return refuse(401, "UNAUTHORIZED", "Sign in to continue.");

  // The network is resolved against the registry and an operator's switch, never used as a host.
  const { network } = await ctx.params;
  const chain = getSponsoredEvmChainByNetwork(network);
  if (!chain) return refuse(404, "NOT_FOUND", "Not found.");
  const upstream = broadcastRpcUrl(network);
  if (!upstream) return refuse(404, "NOT_FOUND", "Not found.");

  if (!limiter.allow(claims.userId))
    return refuse(429, "RATE_LIMITED", "Too many transactions. Try again in a minute.");

  const text = await req.text();
  if (text.length > MAX_RAW_BYTES * 2 + 100)
    return refuse(413, "VALIDATION_ERROR", "Request too large.");
  let raw: unknown;
  try {
    raw = (JSON.parse(text) as { raw?: unknown }).raw;
  } catch {
    return refuse(400, "VALIDATION_ERROR", "Malformed request.");
  }

  const inspection = await inspectRawTransaction(raw, chain.chainId);
  if (!inspection.ok) return refuse(400, inspection.code, inspection.message);

  const owner = await senderCheck(claims.userId, inspection.sender);
  if (owner === "unconfigured")
    return refuse(503, "NOT_CONFIGURED", "Sending isn't set up in this environment.");
  if (owner === "unavailable")
    return refuse(502, "UPSTREAM_ERROR", "We couldn't check this wallet. Nothing was sent.");
  if (owner === "not_registered") {
    return refuse(403, "FORBIDDEN", "That transaction isn't from one of your wallet's addresses.");
  }

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [raw],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const answer = (await res.json().catch(() => null)) as {
      result?: unknown;
      error?: { message?: unknown };
    } | null;
    if (answer && typeof answer.result === "string" && /^0x[0-9a-fA-F]{64}$/.test(answer.result)) {
      return NextResponse.json({ success: true, data: { hash: answer.result } });
    }
    // The chain said no (nonce too low, insufficient funds, ...): say so, plainly and briefly.
    const reason =
      typeof answer?.error?.message === "string"
        ? answer.error.message.slice(0, 200)
        : "The network refused it.";
    return refuse(422, "BROADCAST_REJECTED", reason);
  } catch (error) {
    console.error("EVM broadcast failed:", network, error instanceof Error ? error.name : "error");
    return refuse(502, "UPSTREAM_ERROR", "The network is unreachable. Nothing was sent.");
  }
}
