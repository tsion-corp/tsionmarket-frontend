import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

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

  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Solana RPC is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !methodsAllowed(body)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const res = await fetch(`https://solana-mainnet.g.alchemy.com/v2/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    // Pass the payload through untouched: it is a JSON-RPC envelope, and an
    // error inside it is the caller's to interpret, not ours to rewrite.
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Solana RPC proxy failed:", error);
    return NextResponse.json({ error: "Solana RPC unreachable" }, { status: 502 });
  }
}
