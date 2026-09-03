import "server-only";
import { alchemyRpcProxyFetch, hasAlchemyRpcKey } from "@/lib/server/alchemy-keys";
import type { SponsoredEvmChainConfig } from "@/lib/trade/sponsored-evm";

type RpcId = string | number | null | undefined;

interface RpcCall {
  jsonrpc?: string;
  id?: RpcId;
  method: string;
  params?: unknown;
}

interface RpcEnvelope {
  id?: RpcId;
  error?: { code?: number; message?: string };
  [key: string]: unknown;
}

export interface EvmRpcResult {
  status: number;
  payload: unknown;
  retryAfter?: string;
}

const PUBLIC_RPC_POOLS: Readonly<Record<number, readonly string[]>> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
  10: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
  137: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
  8453: [
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://base.drpc.org",
    "https://base.gateway.tenderly.co",
    "https://rpc-base.blockmachine.io",
    "https://base-mainnet.g.alchemy.com/public",
  ],
  42161: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
};

const PUBLIC_TIMEOUT_MS = 2_500;
const ALCHEMY_TIMEOUT_MS = 8_000;
const PUBLIC_ATTEMPTS_PER_REQUEST = 2;
const CIRCUIT_FAILURES = 3;
const CIRCUIT_OPEN_MS = 30_000;
const DEFAULT_CACHE_MS = 1_000;
const STATIC_CACHE_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 2_000;

const cursors = new Map<number, number>();
const health = new Map<string, { failures: number; blockedUntil: number }>();
const responseCache = new Map<string, { expires: number; payload: unknown }>();
const inflight = new Map<string, Promise<EvmRpcResult>>();

function canonicalize(body: unknown): {
  cacheKey: string;
  upstreamBody: RpcCall | RpcCall[];
  originalIds: RpcId[];
  batch: boolean;
  methods: string[];
} {
  const batch = Array.isArray(body);
  const calls = (batch ? body : [body]) as RpcCall[];
  const originalIds = calls.map((call) => call.id);
  const normalized = calls.map((call, index) => ({
    jsonrpc: call.jsonrpc ?? "2.0",
    id: index + 1,
    method: call.method,
    ...(call.params === undefined ? {} : { params: call.params }),
  }));
  const cacheShape = normalized.map(({ method, params }) => ({ method, params: params ?? [] }));
  return {
    cacheKey: JSON.stringify(cacheShape),
    upstreamBody: batch ? normalized : normalized[0],
    originalIds,
    batch,
    methods: calls.map((call) => call.method),
  };
}

function restoreIds(payload: unknown, originalIds: RpcId[], batch: boolean): unknown {
  const restore = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const envelope = item as RpcEnvelope;
    const index = typeof envelope.id === "number" ? envelope.id - 1 : -1;
    if (index < 0 || index >= originalIds.length) return item;
    const id = originalIds[index];
    if (id === undefined) {
      const withoutId = { ...envelope };
      delete withoutId.id;
      return withoutId;
    }
    return { ...envelope, id };
  };

  if (batch) return Array.isArray(payload) ? payload.map(restore) : payload;
  return restore(payload);
}

function rpcErrors(payload: unknown): RpcEnvelope[] {
  const values = Array.isArray(payload) ? payload : [payload];
  return values.filter(
    (value): value is RpcEnvelope =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value) && "error" in value
  );
}

function shouldFailOver(status: number, payload: unknown): boolean {
  if (status === 401 || status === 403 || status === 429 || status >= 500) return true;
  return rpcErrors(payload).some(({ error }) => {
    const code = error?.code;
    const message = error?.message?.toLowerCase() ?? "";
    return (
      code === -32601 ||
      code === -32005 ||
      code === -32016 ||
      /rate|limit|busy|capacity|temporar|timeout|gateway|unavailable|method not found|unsupported/.test(
        message
      )
    );
  });
}

function recordFailure(url: string): void {
  const previous = health.get(url);
  const failures = (previous?.failures ?? 0) + 1;
  health.set(url, {
    failures: failures >= CIRCUIT_FAILURES ? 0 : failures,
    blockedUntil: failures >= CIRCUIT_FAILURES ? Date.now() + CIRCUIT_OPEN_MS : 0,
  });
}

function publicCandidates(chainId: number): string[] {
  const pool = PUBLIC_RPC_POOLS[chainId] ?? [];
  if (pool.length === 0) return [];
  const start = cursors.get(chainId) ?? 0;
  cursors.set(chainId, (start + 1) % pool.length);
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated
    .filter((url) => (health.get(url)?.blockedUntil ?? 0) <= Date.now())
    .slice(0, PUBLIC_ATTEMPTS_PER_REQUEST);
}

async function callRpc(url: string, body: unknown, timeoutMs: number): Promise<EvmRpcResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: { message: text || `RPC returned HTTP ${response.status}` } };
  }
  return {
    status: response.status,
    payload,
    retryAfter: response.headers.get("retry-after") ?? undefined,
  };
}

function cacheTtl(methods: string[]): number {
  return methods.every((method) => method === "eth_chainId") ? STATIC_CACHE_MS : DEFAULT_CACHE_MS;
}

function putCache(key: string, payload: unknown, ttlMs: number): void {
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    responseCache.delete(oldest);
  }
  responseCache.set(key, { expires: Date.now() + ttlMs, payload });
}

async function loadRpc(
  chain: SponsoredEvmChainConfig,
  body: RpcCall | RpcCall[]
): Promise<EvmRpcResult> {
  let lastError: unknown;
  for (const url of publicCandidates(chain.chainId)) {
    try {
      const result = await callRpc(url, body, PUBLIC_TIMEOUT_MS);
      if (!shouldFailOver(result.status, result.payload)) {
        health.delete(url);
        return result;
      }
      recordFailure(url);
      lastError = result.payload;
    } catch (error) {
      recordFailure(url);
      lastError = error;
    }
  }

  if (hasAlchemyRpcKey()) {
    const response = await alchemyRpcProxyFetch((key) => `https://${chain.alchemyHost}/v2/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: text || `RPC returned HTTP ${response.status}` } };
    }
    return {
      status: response.status,
      payload,
      retryAfter: response.headers.get("retry-after") ?? undefined,
    };
  }

  throw lastError ?? new Error(`No RPC endpoint is available for chain ${chain.chainId}`);
}

export async function forwardEvmRpcRead(
  chain: SponsoredEvmChainConfig,
  body: unknown
): Promise<EvmRpcResult> {
  const request = canonicalize(body);
  const key = `${chain.chainId}:${request.cacheKey}`;
  const hit = responseCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return {
      status: 200,
      payload: restoreIds(hit.payload, request.originalIds, request.batch),
    };
  }

  const pending = inflight.get(key);
  if (pending) {
    const result = await pending;
    return {
      ...result,
      payload: restoreIds(result.payload, request.originalIds, request.batch),
    };
  }

  const load = (async () => {
    const result = await loadRpc(chain, request.upstreamBody);
    if (result.status === 200 && rpcErrors(result.payload).length === 0) {
      putCache(key, result.payload, cacheTtl(request.methods));
    }
    return result;
  })();
  inflight.set(key, load);
  try {
    const result = await load;
    return {
      ...result,
      payload: restoreIds(result.payload, request.originalIds, request.batch),
    };
  } finally {
    inflight.delete(key);
  }
}
