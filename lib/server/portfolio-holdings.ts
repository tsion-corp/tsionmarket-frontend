import "server-only";
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  multicall3Abi,
  type Hex,
} from "viem";
import { readEvm, type RpcCall } from "@/lib/server/evm-read";
import { alchemyFetch, hasAlchemyKey } from "@/lib/server/alchemy-keys";
import type { AlchemyToken } from "@/lib/server/alchemy";

/**
 * EVM balances for the portfolio, read from the chain through the read pool
 * instead of Alchemy's Portfolio API.
 *
 * The Portfolio API (assets/tokens/by-address) costs 360 CU per request and
 * pages through every spam token a wallet ever received, to be filtered down
 * to an allowlist the server already knows. Per network this reads exactly
 * the allowlist: one eth_getBalance and one Multicall3 aggregate3 of
 * balanceOf, both standard JSON-RPC, so any provider answers. Metadata comes
 * from the contract once a day; prices from Alchemy's by-address endpoint
 * only for tokens actually held, shared across users.
 * See ADR-2026-09-07-portfolio-balances-via-multicall.
 */

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

// Chain id per Alchemy network label, for the read pool. Deployment of
// Multicall3 was verified on every one of these on 2026-09-07.
export const NETWORK_CHAIN_ID: Record<string, number> = {
  "eth-mainnet": 1,
  "base-mainnet": 8453,
  "arb-mainnet": 42161,
  "opt-mainnet": 10,
  "polygon-mainnet": 137,
  "apechain-mainnet": 33139,
  "berachain-mainnet": 80094,
  "bnb-mainnet": 56,
  "celo-mainnet": 42220,
  "gensyn-mainnet": 685689,
  "hyperliquid-mainnet": 999,
  "ink-mainnet": 57073,
  "monad-mainnet": 143,
  "robinhood-mainnet": 4663,
  "shape-mainnet": 360,
  "soneium-mainnet": 1868,
  "unichain-mainnet": 130,
  "worldchain-mainnet": 480,
  "gnosis-mainnet": 100,
  "linea-mainnet": 59144,
  "zksync-mainnet": 324,
  "scroll-mainnet": 534352,
  "avax-mainnet": 43114,
  "blast-mainnet": 81457,
  "zora-mainnet": 7777777,
  "ronin-mainnet": 2020,
  "abstract-mainnet": 2741,
  "mythos-mainnet": 42018,
};

// The networks people actually use are read on every refresh; the rest every
// ten minutes, or at once after the caller's own transaction (`fresh`), or as
// hot for an hour once the wallet was seen holding something there.
export const HOT_NETWORKS = new Set([
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
]);
export const HOT_TTL_MS = 75_000;
export const COLD_TTL_MS = 10 * 60_000;
const WARM_FOR_MS = 60 * 60_000;
// A refresh has to end: what has not answered by then is logged and skipped
// for this refresh, and its snapshot stays whatever it was.
export const REFRESH_DEADLINE_MS = 10_000;
// The shared response cache caps at 500 entries and evicts the oldest; with
// 28 snapshots per wallet that cap is passed by 18 wallets, which would
// evict cold snapshots inside their TTL and quietly turn the ten-minute
// cadence back into 75 seconds. Holdings therefore keep their own bounded
// store: room for ~150 wallets' worth, oldest evicted past that.
const HOLDINGS_CAP = 4_200;
const STALE_SERVE_MS = 60_000;
const METADATA_TTL_MS = 24 * 60 * 60_000;
const LOGO_TTL_MS = 24 * 60 * 60_000;
const LOGO_RETRY_MS = 10 * 60_000;
const LOGO_TIMEOUT_MS = 3_000;
const PRICE_TTL_MS = 75_000;
const PRICES_PER_REQUEST = 25;
const MAX_CONCURRENT_NETWORKS = 8;

export interface HoldingRow {
  network: string;
  tokenAddress: string | null;
  // Hex, as the chain returns it; normalize() parses either form.
  tokenBalance: string;
}

const warmUntil = new Map<string, number>();

interface Snapshot {
  expires: number;
  writtenAt: number;
  rows: HoldingRow[];
}
const holdingsCache = new Map<string, Snapshot>();
const holdingsInflight = new Map<string, Promise<HoldingRow[]>>();

function remember(key: string, rows: HoldingRow[], ttlMs: number, startedAt: number): void {
  const current = holdingsCache.get(key);
  if (current && current.writtenAt > startedAt) return; // a fresher read already landed
  holdingsCache.delete(key);
  holdingsCache.set(key, { expires: Date.now() + ttlMs, writtenAt: Date.now(), rows });
  if (holdingsCache.size > HOLDINGS_CAP) {
    const now = Date.now();
    for (const [k, snapshot] of holdingsCache) {
      if (holdingsCache.size <= HOLDINGS_CAP) break;
      if (snapshot.expires <= now - STALE_SERVE_MS) holdingsCache.delete(k);
    }
    for (const k of holdingsCache.keys()) {
      if (holdingsCache.size <= HOLDINGS_CAP) break;
      holdingsCache.delete(k);
    }
  }
}

function markWarm(key: string): void {
  const now = Date.now();
  for (const [k, until] of warmUntil) if (until <= now) warmUntil.delete(k);
  warmUntil.set(key, now + WARM_FOR_MS);
}

// The chain answers a quantity as a 0x-prefixed hex string; an empty "0x"
// (seen from some providers for an untouched account) means zero. Anything
// else is a provider fault and is named as such rather than crashing later.
function hexQuantity(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${what}: unexpected answer ${JSON.stringify(value)}`);
  }
  return value === "0x" ? "0x0" : value;
}

function balanceOfCall(wallet: Hex) {
  return encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
}

function decodeAggregate3(data: Hex): { success: boolean; returnData: Hex }[] {
  return decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data }) as {
    success: boolean;
    returnData: Hex;
  }[];
}

function decodeUint(returnData: Hex): bigint | null {
  if (!returnData || returnData.length < 66) return null;
  try {
    return decodeAbiParameters([{ type: "uint256" }], returnData)[0];
  } catch {
    return null;
  }
}

function decodeString(returnData: Hex): string | null {
  if (!returnData || returnData === "0x") return null;
  try {
    return decodeAbiParameters([{ type: "string" }], returnData)[0];
  } catch {
    // Some older tokens answer symbol()/name() as bytes32.
    if (returnData.length === 66) {
      try {
        const raw = decodeAbiParameters([{ type: "bytes32" }], returnData)[0] as string;
        const text = Buffer.from(raw.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
        return text || null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function multicall(chainId: number, network: string, targets: { target: Hex; callData: Hex }[]) {
  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [targets.map((t) => ({ ...t, allowFailure: true }))],
  });
  return {
    network,
    chainId,
    call: { method: "eth_call", params: [{ to: MULTICALL3, data }, "latest"] },
  };
}

/**
 * The wallet's native balance and every allowed contract's balance on one
 * network, as one upstream batch. Token rows only where the balance is above
 * zero; the native row always, so a funded gas balance is never missed.
 */
export async function readHoldings(
  wallet: string,
  network: string,
  contracts: string[],
  fresh = false
): Promise<HoldingRow[]> {
  const chainId = NETWORK_CHAIN_ID[network];
  if (!chainId) throw new Error(`No chain id for ${network}`);
  const key = `${network}:${wallet.toLowerCase()}`;
  const hot = HOT_NETWORKS.has(network) || (warmUntil.get(key) ?? 0) > Date.now();
  const ttl = hot ? HOT_TTL_MS : COLD_TTL_MS;

  const hit = holdingsCache.get(key);
  if (!fresh && hit && hit.expires > Date.now()) return hit.rows;
  const inflightKey = fresh ? `fresh:${key}` : key;
  const pending = holdingsInflight.get(inflightKey);
  if (pending) return pending;

  const startedAt = Date.now();
  const run = (async () => {
    try {
      const calls: RpcCall[] = [{ id: 1, method: "eth_getBalance", params: [wallet, "latest"] }];
      const targets = contracts.map((address) => ({
        target: address as Hex,
        callData: balanceOfCall(wallet as Hex),
      }));
      if (targets.length > 0) calls.push({ id: 2, ...multicall(chainId, network, targets).call });

      const [native, tokens] = await readEvm(network, chainId, calls);
      if (native.error) throw new Error(`${network} eth_getBalance: ${native.error.message}`);
      const rows: HoldingRow[] = [
        {
          network,
          tokenAddress: null,
          tokenBalance: hexQuantity(native.result, `${network} eth_getBalance`),
        },
      ];
      if (tokens) {
        if (tokens.error) throw new Error(`${network} multicall: ${tokens.error.message}`);
        decodeAggregate3(hexQuantity(tokens.result, `${network} multicall`) as Hex).forEach(
          (entry, index) => {
            if (!entry.success) return;
            const balance = decodeUint(entry.returnData);
            if (balance === null || balance <= 0n) return;
            rows.push({
              network,
              tokenAddress: contracts[index],
              tokenBalance: `0x${balance.toString(16)}`,
            });
          }
        );
      }
      if (rows.some((row) => BigInt(row.tokenBalance) > 0n)) markWarm(key);
      remember(key, rows, ttl, startedAt);
      return rows;
    } catch (error) {
      // A throttled or failing provider degrades to a slightly stale
      // snapshot instead of blanking the network, as the shared cache does.
      if (hit && hit.expires > Date.now() - STALE_SERVE_MS) return hit.rows;
      throw error;
    } finally {
      holdingsInflight.delete(inflightKey);
    }
  })();
  holdingsInflight.set(inflightKey, run);
  return run;
}

export interface TokenMeta {
  decimals: number;
  symbol: string | null;
  name: string | null;
  logo: string | null;
}

// decimals/symbol/name from the contracts themselves, one multicall per
// network for the tokens not yet seen. Cached a day: they do not change.
async function contractMetadata(
  network: string,
  addresses: string[]
): Promise<Map<string, TokenMeta>> {
  const chainId = NETWORK_CHAIN_ID[network];
  const out = new Map<string, TokenMeta>();
  if (!chainId || addresses.length === 0) return out;
  const targets = addresses.flatMap((address) =>
    (["decimals", "symbol", "name"] as const).map((functionName) => ({
      target: address as Hex,
      callData: encodeFunctionData({ abi: erc20Abi, functionName }),
    }))
  );
  const [answer] = await readEvm(network, chainId, [
    { id: 1, ...multicall(chainId, network, targets).call },
  ]);
  if (answer.error) throw new Error(`${network} metadata multicall: ${answer.error.message}`);
  const results = decodeAggregate3(answer.result as Hex);
  addresses.forEach((address, i) => {
    const [decimals, symbol, name] = results.slice(i * 3, i * 3 + 3);
    const dec = decimals?.success ? decodeUint(decimals.returnData) : null;
    out.set(address, {
      decimals: dec === null ? 18 : Number(dec),
      symbol: symbol?.success ? decodeString(symbol.returnData) : null,
      name: name?.success ? decodeString(name.returnData) : null,
      logo: null,
    });
  });
  return out;
}

// A logo is cosmetic: Alchemy's token metadata has one for most listed
// tokens, at 10 CU once per token per day process-wide. One batch per
// network for the tokens without a cached answer, on a short timeout; a
// failure costs nothing but the icon, and is retried after ten minutes, so a
// slow moment never blanks logos for a day. The icon component has built-in
// icons and a badge fallback.
const logoCache = new Map<string, { expires: number; logo: string | null }>();

async function logos(network: string, addresses: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const now = Date.now();
  const missing: string[] = [];
  for (const address of addresses) {
    const hit = logoCache.get(`${network}:${address}`);
    if (hit && hit.expires > now) out.set(address, hit.logo);
    else missing.push(address);
  }
  if (missing.length === 0 || !hasAlchemyKey()) return out;
  try {
    const res = await alchemyFetch((key) => `https://${network}.g.alchemy.com/v2/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        missing.map((address, id) => ({
          jsonrpc: "2.0",
          id: id + 1,
          method: "alchemy_getTokenMetadata",
          params: [address],
        }))
      ),
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      cache: "no-store",
    });
    const payload = (await res.json()) as { id?: number; result?: { logo?: string | null } }[];
    for (const envelope of Array.isArray(payload) ? payload : [payload]) {
      const address = missing[(envelope.id ?? 0) - 1];
      if (!address) continue;
      const logo = envelope.result?.logo ?? null;
      logoCache.set(`${network}:${address}`, { expires: Date.now() + LOGO_TTL_MS, logo });
      out.set(address, logo);
    }
  } catch (error) {
    console.warn(`portfolio-holdings: no logos for ${network}; retry in 10 min`, error);
  }
  for (const address of missing) {
    if (!out.has(address)) {
      logoCache.set(`${network}:${address}`, { expires: Date.now() + LOGO_RETRY_MS, logo: null });
      out.set(address, null);
    }
  }
  return out;
}

// Contract metadata for the held tokens on one network: cached per token for
// a day; the ones not yet seen are read in ONE multicall, not one per token.
async function tokenMetadata(
  network: string,
  addresses: string[]
): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  const missing: string[] = [];
  for (const address of addresses) {
    const hit = metaCache.get(`${network}:${address}`);
    if (hit && hit.expires > Date.now()) out.set(address, hit.meta);
    else missing.push(address);
  }
  const [fresh, logoMap] = await Promise.all([
    missing.length > 0 ? contractMetadata(network, missing) : new Map<string, TokenMeta>(),
    logos(network, addresses),
  ]);
  for (const [address, meta] of fresh) {
    metaCache.set(`${network}:${address}`, { expires: Date.now() + METADATA_TTL_MS, meta });
    out.set(address, meta);
  }
  for (const [address, meta] of out)
    out.set(address, { ...meta, logo: logoMap.get(address) ?? null });
  return out;
}

const metaCache = new Map<string, { expires: number; meta: TokenMeta }>();

const priceCache = new Map<string, { expires: number; value: number | null }>();

// USD prices for held tokens through Alchemy's by-address endpoint, in
// chunks of 25, cached per token so every user holding USDC shares one call.
export async function tokenPrices(
  items: { network: string; address: string }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const now = Date.now();
  const missing: { network: string; address: string }[] = [];
  for (const item of items) {
    const key = `${item.network}:${item.address.toLowerCase()}`;
    const hit = priceCache.get(key);
    if (hit && hit.expires > now) {
      if (hit.value !== null) out.set(key, hit.value);
    } else {
      missing.push(item);
    }
  }
  if (missing.length === 0 || !hasAlchemyKey()) return out;

  for (let i = 0; i < missing.length; i += PRICES_PER_REQUEST) {
    const batch = missing.slice(i, i + PRICES_PER_REQUEST);
    try {
      const res = await alchemyFetch(
        (key) => `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-address`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: batch }),
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        }
      );
      const data = (await res.json()) as {
        data?: {
          network: string;
          address: string;
          prices?: { currency: string; value: string }[];
        }[];
      };
      const answered = new Set<string>();
      for (const row of data?.data ?? []) {
        const key = `${row.network}:${row.address.toLowerCase()}`;
        const usd = row.prices?.find((p) => p.currency === "usd");
        const value = usd ? parseFloat(usd.value) : NaN;
        const price = Number.isFinite(value) && value > 0 ? value : null;
        priceCache.set(key, { expires: Date.now() + PRICE_TTL_MS, value: price });
        answered.add(key);
        if (price !== null) out.set(key, price);
      }
      for (const item of batch) {
        const key = `${item.network}:${item.address.toLowerCase()}`;
        if (!answered.has(key))
          priceCache.set(key, { expires: Date.now() + PRICE_TTL_MS, value: null });
      }
    } catch (error) {
      console.warn("portfolio-holdings: price lookup failed for a batch", error);
    }
  }
  return out;
}

async function inSlots<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * The wallet's EVM holdings across `networks` in the shape normalize()
 * already consumes: balances from the chain, metadata from the contracts,
 * prices by address. One failed network is logged and skipped; every network
 * failing propagates, so the portfolio cache's stale-serve still applies.
 */
export async function readEvmPortfolioTokens(
  wallet: string,
  networks: readonly string[],
  contractsFor: (network: string) => string[],
  fresh: boolean
): Promise<AlchemyToken[]> {
  const deadline = Date.now() + REFRESH_DEADLINE_MS;
  const settled = await inSlots(
    networks.map((network) => () => {
      const read = readHoldings(wallet, network, contractsFor(network), fresh);
      const remaining = deadline - Date.now();
      if (remaining <= 0) return Promise.reject(new Error(`${network}: refresh deadline passed`));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${network}: no answer within ${REFRESH_DEADLINE_MS}ms`)),
          remaining
        );
      });
      return Promise.race([read, expiry]).finally(() => clearTimeout(timer));
    }),
    MAX_CONCURRENT_NETWORKS
  );
  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length > 0 && failed.length === settled.length) throw failed[0].reason;
  if (failed.length > 0) {
    console.error(
      `readEvmPortfolioTokens: ${failed.length}/${settled.length} networks failed`,
      failed.map((r) => (r.reason instanceof Error ? r.reason.message : r.reason))
    );
  }
  const rows = settled
    .filter((r): r is PromiseFulfilledResult<HoldingRow[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const held = rows.filter(
    (row): row is HoldingRow & { tokenAddress: string } => row.tokenAddress !== null
  );
  const byNetwork = new Map<string, string[]>();
  for (const row of held) {
    const list = byNetwork.get(row.network) ?? [];
    list.push(row.tokenAddress);
    byNetwork.set(row.network, list);
  }
  const [metas, prices] = await Promise.all([
    Promise.all(
      [...byNetwork].map(
        async ([network, addresses]) => [network, await tokenMetadata(network, addresses)] as const
      )
    ),
    tokenPrices(held.map((row) => ({ network: row.network, address: row.tokenAddress }))),
  ]);
  const metaFor = new Map(metas);

  return rows.map((row) => {
    if (row.tokenAddress === null) {
      return {
        network: row.network,
        tokenAddress: null,
        tokenBalance: row.tokenBalance,
        tokenPrices: [],
      };
    }
    const meta = metaFor.get(row.network)?.get(row.tokenAddress);
    const price = prices.get(`${row.network}:${row.tokenAddress.toLowerCase()}`);
    return {
      network: row.network,
      tokenAddress: row.tokenAddress,
      tokenBalance: row.tokenBalance,
      tokenMetadata: meta
        ? {
            decimals: meta.decimals,
            symbol: meta.symbol ?? undefined,
            name: meta.name ?? undefined,
            logo: meta.logo ?? undefined,
          }
        : undefined,
      tokenPrices: price !== undefined ? [{ currency: "usd", value: String(price) }] : [],
    };
  });
}

/** Test seam. */
export function resetHoldingsState(): void {
  warmUntil.clear();
  holdingsCache.clear();
  holdingsInflight.clear();
  priceCache.clear();
  metaCache.clear();
  logoCache.clear();
}
