import "server-only";
import { zeroDevRpcUrl } from "@/lib/server/zerodev";
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
  result?: unknown;
  [key: string]: unknown;
}

export interface EvmRpcResult {
  status: number;
  payload: unknown;
  retryAfter?: string;
}

const ZERODEV_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_MS = 1_000;
const BLOCK_CACHE_MS = 4_000;
const STATE_CACHE_MS = 2_000;
const CODE_CACHE_MS = 10_000;
const LOG_CACHE_MS = 5_000;
const TRANSACTION_CACHE_MS = 30_000;
const CONFIRMED_RECEIPT_CACHE_MS = 5 * 60_000;
const STATIC_CACHE_MS = 5 * 60_000;
const STALE_IF_ERROR_MS = 30_000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 5_000;
const DEFAULT_FAILURE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_UPSTREAM_CONCURRENCY = 8;
const MAX_CACHE_ENTRIES = 2_000;

interface CachedResponse {
  expires: number;
  staleUntil: number;
  payload: unknown;
}

interface ProviderBackoff {
  until: number;
  status: number;
}

const responseCache = new Map<string, CachedResponse>();
const inflight = new Map<string, Promise<EvmRpcResult>>();
const upstreamWaiters: Array<() => void> = [];
let activeUpstreamRequests = 0;
let providerBackoff: ProviderBackoff | null = null;

function canonicalize(body: unknown): {
  cacheKey: string;
  upstreamBody: RpcCall | RpcCall[];
  originalIds: RpcId[];
  batch: boolean;
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

function responseForCall(payload: unknown, id: RpcId): RpcEnvelope | undefined {
  const values = Array.isArray(payload) ? payload : [payload];
  return values.find(
    (value): value is RpcEnvelope =>
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as RpcEnvelope).id === id
  );
}

function cacheTtlForCall(call: RpcCall, payload: unknown): number {
  const response = responseForCall(payload, call.id);
  const params = Array.isArray(call.params) ? call.params : [];

  switch (call.method) {
    case "eth_chainId":
      return STATIC_CACHE_MS;
    case "eth_blockNumber":
      return BLOCK_CACHE_MS;
    case "eth_getTransactionReceipt":
      return response?.result ? CONFIRMED_RECEIPT_CACHE_MS : STATE_CACHE_MS;
    case "eth_getTransactionByHash":
      return response?.result ? TRANSACTION_CACHE_MS : STATE_CACHE_MS;
    case "eth_getBlockByNumber":
      return typeof params[0] === "string" && !["latest", "pending", "safe"].includes(params[0])
        ? TRANSACTION_CACHE_MS
        : BLOCK_CACHE_MS;
    case "eth_getCode":
      return CODE_CACHE_MS;
    case "eth_getLogs":
      return LOG_CACHE_MS;
    case "eth_call":
    case "eth_getBalance":
    case "eth_feeHistory":
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return STATE_CACHE_MS;
    case "eth_getTransactionCount":
      return params[1] === "pending" ? DEFAULT_CACHE_MS : STATE_CACHE_MS;
    default:
      return DEFAULT_CACHE_MS;
  }
}

function cacheTtl(calls: RpcCall[], payload: unknown): number {
  return Math.min(...calls.map((call) => cacheTtlForCall(call, payload)));
}

function putCache(key: string, payload: unknown, ttlMs: number): void {
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    responseCache.delete(oldest);
  }
  const expires = Date.now() + ttlMs;
  responseCache.set(key, { expires, staleUntil: expires + STALE_IF_ERROR_MS, payload });
}

function retryAfterMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallbackMs;
}

function startProviderBackoff(result: EvmRpcResult): void {
  if (result.status !== 429 && result.status < 500) return;
  const fallback =
    result.status === 429 ? DEFAULT_RATE_LIMIT_BACKOFF_MS : DEFAULT_FAILURE_BACKOFF_MS;
  const delay = Math.min(
    MAX_BACKOFF_MS,
    Math.max(1_000, retryAfterMs(result.retryAfter, fallback))
  );
  providerBackoff = { until: Date.now() + delay, status: result.status };
}

function backoffResult(body: RpcCall | RpcCall[], backoff: ProviderBackoff): EvmRpcResult {
  const calls = Array.isArray(body) ? body : [body];
  const payload = calls.map((call) => ({
    jsonrpc: "2.0",
    id: call.id,
    error: {
      code: -32005,
      message:
        backoff.status === 429
          ? "ZeroDev RPC is rate limited. Retry shortly."
          : "ZeroDev RPC is temporarily unavailable. Retry shortly.",
    },
  }));
  return {
    status: backoff.status,
    payload: Array.isArray(body) ? payload : payload[0],
    retryAfter: String(Math.max(1, Math.ceil((backoff.until - Date.now()) / 1_000))),
  };
}

function currentProviderBackoff(): ProviderBackoff | null {
  if (!providerBackoff) return null;
  if (providerBackoff.until > Date.now()) return providerBackoff;
  providerBackoff = null;
  return null;
}

async function withUpstreamSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeUpstreamRequests >= MAX_UPSTREAM_CONCURRENCY) {
    await new Promise<void>((resolve) => upstreamWaiters.push(resolve));
  }
  activeUpstreamRequests += 1;
  try {
    return await run();
  } finally {
    activeUpstreamRequests -= 1;
    upstreamWaiters.shift()?.();
  }
}

async function loadRpc(
  chain: SponsoredEvmChainConfig,
  body: RpcCall | RpcCall[]
): Promise<EvmRpcResult> {
  const upstream = zeroDevRpcUrl(chain.chainId);
  if (!upstream) throw new Error("ZeroDev RPC is not configured");
  return callRpc(upstream, body, ZERODEV_TIMEOUT_MS);
}

export async function forwardEvmRpcRead(
  chain: SponsoredEvmChainConfig,
  body: unknown
): Promise<EvmRpcResult> {
  const request = canonicalize(body);
  const calls = Array.isArray(request.upstreamBody) ? request.upstreamBody : [request.upstreamBody];
  const key = `${chain.chainId}:${request.cacheKey}`;
  const hit = responseCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return {
      status: 200,
      payload: restoreIds(hit.payload, request.originalIds, request.batch),
    };
  }
  if (hit && hit.staleUntil <= Date.now()) responseCache.delete(key);

  const pending = inflight.get(key);
  if (pending) {
    const result = await pending;
    return {
      ...result,
      payload: restoreIds(result.payload, request.originalIds, request.batch),
    };
  }

  const load = withUpstreamSlot(async () => {
    const backoff = currentProviderBackoff();
    if (backoff) {
      if (hit && hit.staleUntil > Date.now()) return { status: 200, payload: hit.payload };
      return backoffResult(request.upstreamBody, backoff);
    }

    let result: EvmRpcResult;
    try {
      result = await loadRpc(chain, request.upstreamBody);
    } catch (error) {
      providerBackoff = { until: Date.now() + DEFAULT_FAILURE_BACKOFF_MS, status: 502 };
      if (hit && hit.staleUntil > Date.now()) return { status: 200, payload: hit.payload };
      throw error;
    }
    if (result.status === 200 && rpcErrors(result.payload).length === 0) {
      putCache(key, result.payload, cacheTtl(calls, result.payload));
      return result;
    }

    startProviderBackoff(result);
    if (hit && hit.staleUntil > Date.now() && (result.status === 429 || result.status >= 500)) {
      return { status: 200, payload: hit.payload };
    }
    return result;
  });
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
