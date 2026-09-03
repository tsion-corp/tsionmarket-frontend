import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { alchemyUrls } from "@/lib/server/alchemy-keys";

// Solana JSON-RPC for the browser. Privy needs an RPC endpoint to broadcast a
// Solana transaction, and the wallet code needs one to read blockhashes and
// confirm signatures. The public mainnet endpoint rate-limits browser traffic
// hard, so this proxies our Alchemy key instead — server-side, because a key
// shipped to the client is a key anyone can spend.
//
// Auth-gated exactly like the portfolio, which spends the same key. Privy's
// same-origin fetch carries the privy-token cookie, so no header plumbing is
// needed on the client.

const UPSTREAM_TIMEOUT_MS = 15_000;
const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

// Only what the wallet flows actually call. An open proxy would be a free
// Alchemy relay for anyone who found it.
const ALLOWED_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getFeeForMessage",
  "getGenesisHash",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "getTokenAccountsByOwner",
  "getTransaction",
  "sendTransaction",
  "simulateTransaction",
]);

interface RpcCall {
  method?: unknown;
}

function upstreams(): string[] {
  const configured = process.env.SOLANA_RPC_URL;
  // One entry per configured Alchemy key, so a throttled or rejected key is
  // just another upstream to step past rather than the end of the list.
  return [
    configured,
    ...alchemyUrls((key) => `https://solana-mainnet.g.alchemy.com/v2/${key}`),
    PUBLIC_SOLANA_RPC,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
}

function methodsAllowed(body: unknown): boolean {
  const calls: RpcCall[] = Array.isArray(body) ? body : [body as RpcCall];
  if (calls.length === 0 || calls.length > 10) return false;
  return calls.every((c) => typeof c?.method === "string" && ALLOWED_METHODS.has(c.method));
}

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !methodsAllowed(body)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serialized = JSON.stringify(body);
  let lastFailure: unknown;
  for (const upstream of upstreams()) {
    try {
      const res = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      });
      const payload = await res.text();
      if (res.ok || (res.status < 500 && res.status !== 429)) {
        // Pass JSON-RPC envelopes through untouched, including method errors.
        return new NextResponse(payload, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      lastFailure = new Error(`Solana RPC returned ${res.status}`);
    } catch (error) {
      lastFailure = error;
    }
  }
  console.error("Solana RPC proxy failed:", lastFailure);
  return NextResponse.json({ error: "Solana RPC unreachable" }, { status: 502 });
}
