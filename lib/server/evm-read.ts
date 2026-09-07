import "server-only";
import { zeroDevRpcUrl } from "@/lib/server/zerodev";
import { alchemyFetch, hasAlchemyKey } from "@/lib/server/alchemy-keys";

/**
 * Standard JSON-RPC reads through the read pool: ZeroDev first, the Alchemy
 * key pool when ZeroDev cannot serve the chain or the method.
 *
 * Probed on 2026-09-07 with the project in use: ZeroDev answers plain reads
 * on 24 of our 28 networks and HTTP 400 "No API provider supports the
 * requested chainId" on the other four; per method it may answer "Method not
 * found" or "not whitelisted" depending on which provider it routed to. A
 * chain or method it cannot serve is remembered for a cooldown, so the next
 * read goes straight to Alchemy instead of paying for the same refusal; a
 * 429 backs the whole provider off for a minute; any other failure falls
 * through for this one call. Nothing is ever retried against the same
 * provider. See ADR-2026-09-07-portfolio-balances-via-multicall.
 */

export interface RpcCall {
  id?: number | string;
  method: string;
  params?: unknown;
}

export interface RpcEnvelope {
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

const ZERODEV_TIMEOUT_MS = 8_000;
const ALCHEMY_TIMEOUT_MS = 12_000;
export const UNSUPPORTED_COOLDOWN_MS = 10 * 60_000;
export const RATE_LIMIT_BACKOFF_MS = 60_000;
const FAILURE_BACKOFF_MS = 2_000;

// Per chain: ZeroDev has no provider, or its provider lacks a method we need.
const zeroDevSkipUntil = new Map<number, number>();
// Whole provider: rate limited or failing.
let zeroDevBackoffUntil = 0;

const NOT_SERVED = /method not found|does not exist|not whitelisted|not supported/i;
// ZeroDev's own answers for a chain it does not serve, as seen live:
// "No API provider supports the requested chainId" and "Could not find chain".
const NO_PROVIDER = /no api provider|could not find chain/i;

function toBatch(calls: RpcCall[]) {
  return calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: call.id ?? index + 1,
    method: call.method,
    params: call.params ?? [],
  }));
}

function inCallOrder(payload: unknown, batch: { id: number | string }[]): RpcEnvelope[] {
  const envelopes = (Array.isArray(payload) ? payload : [payload]) as RpcEnvelope[];
  const byId = new Map(envelopes.map((e) => [String(e.id), e]));
  return batch.map(
    (call) =>
      byId.get(String(call.id)) ?? {
        id: call.id,
        error: { code: -32603, message: "No answer for this call in the provider's response" },
      }
  );
}

function unservedError(envelopes: RpcEnvelope[]): RpcEnvelope["error"] | null {
  for (const envelope of envelopes) {
    const error = envelope.error;
    if (!error) continue;
    if (error.code === -32601 || NOT_SERVED.test(error.message ?? "")) return error;
  }
  return null;
}

async function fromZeroDev(
  chainId: number,
  batch: ReturnType<typeof toBatch>
): Promise<RpcEnvelope[] | null> {
  const url = zeroDevRpcUrl(chainId);
  const now = Date.now();
  if (!url || zeroDevBackoffUntil > now || (zeroDevSkipUntil.get(chainId) ?? 0) > now) return null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(ZERODEV_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.warn(`evm-read: ZeroDev unreachable for chain ${chainId}; using Alchemy`, error);
    return null;
  }

  if (response.status === 429) {
    zeroDevBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    console.warn(`evm-read: ZeroDev rate limited; Alchemy for ${RATE_LIMIT_BACKOFF_MS / 1000}s`);
    return null;
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    if (response.status === 400 && NO_PROVIDER.test(body)) {
      // ZeroDev's own answer for a chain it has no provider for. Anything
      // else is either transient or a request of ours, and neither should
      // park the chain, let alone the provider: fall through for this call.
      zeroDevSkipUntil.set(chainId, Date.now() + UNSUPPORTED_COOLDOWN_MS);
      console.warn(`evm-read: ZeroDev does not serve chain ${chainId}; Alchemy for 10 min`);
    } else {
      if (response.status >= 500) zeroDevSkipUntil.set(chainId, Date.now() + FAILURE_BACKOFF_MS);
      console.warn(
        `evm-read: ZeroDev answered ${response.status} for chain ${chainId} (${body}); using Alchemy`
      );
    }
    return null;
  }

  const payload: unknown = await response.json();
  if (
    !Array.isArray(payload) &&
    !(payload && typeof payload === "object" && "jsonrpc" in payload)
  ) {
    console.warn(
      `evm-read: ZeroDev answered a non-JSON-RPC body for chain ${chainId} (${JSON.stringify(payload).slice(0, 200)}); using Alchemy`
    );
    return null;
  }
  const envelopes = inCallOrder(payload, batch);
  const unserved = unservedError(envelopes);
  if (unserved) {
    zeroDevSkipUntil.set(chainId, Date.now() + UNSUPPORTED_COOLDOWN_MS);
    console.warn(
      `evm-read: ZeroDev's provider for chain ${chainId} lacks a method (${unserved.message}); Alchemy for 10 min`
    );
    return null;
  }
  return envelopes;
}

/** Envelopes in the order of `calls`, whichever provider answered. */
export async function readEvm(
  network: string,
  chainId: number,
  calls: RpcCall[]
): Promise<RpcEnvelope[]> {
  const batch = toBatch(calls);
  const zeroDev = await fromZeroDev(chainId, batch);
  if (zeroDev) return zeroDev;

  if (!hasAlchemyKey()) throw new Error(`No read provider can serve ${network}`);
  const response = await alchemyFetch((key) => `https://${network}.g.alchemy.com/v2/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS),
    cache: "no-store",
  });
  return inCallOrder(await response.json(), batch);
}

/** Test seam: the module keeps process-wide provider state. */
export function resetEvmReadState(): void {
  zeroDevSkipUntil.clear();
  zeroDevBackoffUntil = 0;
}
