import "server-only";

// Market data for catalog assets. The RWA backend serves a price for almost no
// asset, an APY for three and a TVL for one, so price, 24h change, pool
// liquidity and market cap are sourced here instead. Batched by chain family so
// a page load costs a couple of upstream calls, never one per asset: fanning
// out per address rate-limited instantly.
//
// Solana goes to Jupiter, which prices the xStocks and Ondo mints that generic
// token-price APIs do not carry, and carries every stat we show. EVM prices and
// the 24h move come from Alchemy, the same premium key the portfolio uses.
//
// GeckoTerminal supplies only what neither of those has — EVM pool liquidity
// and market cap — because it is keyless and capped at 30 requests a minute
// across every user. It is called once per chain per cache window and nothing
// depends on it: a rate-limited response costs a dash, never a price.

import { change24hFrom, fetchTokenHistory } from "@/lib/server/token-history";
import { alchemyFetch, hasAlchemyKey } from "@/lib/server/alchemy-keys";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const GECKOTERMINAL_URL = "https://api.geckoterminal.com/api/v2";
const JUPITER_BATCH = 50;
const ALCHEMY_BATCH = 25;
// GeckoTerminal's multi-token endpoint accepts at most 30 addresses.
const GECKOTERMINAL_BATCH = 30;
const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

export interface PriceRequestItem {
  // The asset's own id, echoed back so the client can map without re-deriving.
  id: string;
  chain: string;
  address: string;
}

export interface RwaMarketStats {
  priceUsd?: number;
  // Percent move over the last 24 hours, e.g. 1.86 for +1.86%.
  change24h?: number;
  // Value pooled across the DEXes that trade this token — what actually bounds
  // a trade, unlike the issuer's total TVL across every chain.
  liquidityUsd?: number;
  marketCapUsd?: number;
}

const cache = new Map<string, { expires: number; stats: RwaMarketStats }>();

// Depth-less entries are cached apart from full ones, so the portfolio's
// cheaper lookup never satisfies the table's request for liquidity.
function cacheKey(chain: string, address: string, withDepth: boolean): string {
  return `${withDepth ? "full" : "price"}:${chain}:${address.toLowerCase()}`;
}

function cached(key: string): RwaMarketStats | undefined {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.stats;
  if (hit) cache.delete(key);
  return undefined;
}

function remember(key: string, stats: RwaMarketStats): void {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, stats });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// A positive finite number, or undefined. Upstreams return strings, nulls and
// zeroes interchangeably for "unknown".
function positive(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

// A percent change, where zero is a real value rather than a missing one.
function percent(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

interface JupiterPrice {
  usdPrice?: number;
  priceChange24h?: number;
  liquidity?: number;
  // Present for xStocks: the market cap of the underlying equity.
  stockData?: { mcap?: number };
}

async function jupiterStats(mints: string[]): Promise<Map<string, RwaMarketStats>> {
  const out = new Map<string, RwaMarketStats>();
  await Promise.all(
    chunk(mints, JUPITER_BATCH).map(async (batch) => {
      try {
        const res = await fetch(`${JUPITER_PRICE_URL}?ids=${batch.join(",")}`, {
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          cache: "no-store",
        });
        const data = (await res.json()) as Record<string, JupiterPrice>;
        for (const [mint, value] of Object.entries(data ?? {})) {
          out.set(mint, {
            priceUsd: positive(value?.usdPrice),
            change24h: percent(value?.priceChange24h),
            liquidityUsd: positive(value?.liquidity),
            marketCapUsd: positive(value?.stockData?.mcap),
          });
        }
      } catch {
        // A missing stat renders as a dash; it must never fail the page.
      }
    })
  );
  return out;
}

async function alchemyPrices(
  items: { network: string; address: string }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!hasAlchemyKey()) return out;

  await Promise.all(
    chunk(items, ALCHEMY_BATCH).map(async (batch) => {
      try {
        const res = await alchemyFetch(
          (key) => `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-address`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: batch }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
        for (const row of data?.data ?? []) {
          const usd = row.prices?.find((p) => p.currency === "usd");
          const price = positive(usd?.value);
          if (price != null) out.set(`${row.network}:${row.address.toLowerCase()}`, price);
        }
      } catch {
        // Same: partial results are fine.
      }
    })
  );
  return out;
}

interface GeckoTerminalToken {
  id: string;
  attributes?: {
    address?: string;
    price_usd?: string;
    total_reserve_in_usd?: string;
    market_cap_usd?: string | null;
    fdv_usd?: string;
  };
}

interface GeckoTerminalPool {
  attributes?: { price_change_percentage?: { h24?: string } };
  relationships?: { base_token?: { data?: { id?: string } } };
}

// Price, liquidity, market cap and 24h change for EVM tokens in one call per
// batch. `include=top_pools` is what carries the 24h move: the token resource
// itself has no price history, only its pools do.
async function geckoTerminalStats(
  network: string,
  addresses: string[]
): Promise<Map<string, RwaMarketStats>> {
  const out = new Map<string, RwaMarketStats>();
  await Promise.all(
    chunk(addresses, GECKOTERMINAL_BATCH).map(async (batch) => {
      try {
        const url = `${GECKOTERMINAL_URL}/networks/${network}/tokens/multi/${batch.join(",")}?include=top_pools`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          cache: "no-store",
        });
        const body = (await res.json()) as {
          data?: GeckoTerminalToken[];
          included?: GeckoTerminalPool[];
        };

        // The deepest pool per token is the one whose 24h move is meaningful;
        // `included` arrives ordered by liquidity, so the first wins.
        const changeByToken = new Map<string, number>();
        for (const pool of body.included ?? []) {
          const tokenId = pool.relationships?.base_token?.data?.id;
          const h24 = percent(pool.attributes?.price_change_percentage?.h24);
          if (!tokenId || h24 == null || changeByToken.has(tokenId)) continue;
          changeByToken.set(tokenId, h24);
        }

        for (const token of body.data ?? []) {
          const address = token.attributes?.address;
          if (!address) continue;
          out.set(address.toLowerCase(), {
            priceUsd: positive(token.attributes?.price_usd),
            change24h: changeByToken.get(token.id),
            liquidityUsd: positive(token.attributes?.total_reserve_in_usd),
            marketCapUsd:
              positive(token.attributes?.market_cap_usd) ?? positive(token.attributes?.fdv_usd),
          });
        }
      } catch {
        // Same: partial results are fine.
      }
    })
  );
  return out;
}

const CHAIN_TO_ALCHEMY: Record<string, string> = {
  base: "base-mainnet",
  ethereum: "eth-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
};

const CHAIN_TO_GECKOTERMINAL: Record<string, string> = {
  base: "base",
  ethereum: "eth",
  arbitrum: "arbitrum",
  polygon: "polygon_pos",
};

// Market stats per requested asset id. Assets nothing could be resolved for are
// simply absent, and their cells keep the dash.
//
// `withDepth` adds the EVM liquidity and market cap that only GeckoTerminal
// carries. The table asks for it; the portfolio, which only needs to value a
// holding, does not — and leaving it off there keeps the shared keyless budget
// for the one caller that uses it.
export async function fetchRwaMarket(
  items: PriceRequestItem[],
  withDepth = true
): Promise<Record<string, RwaMarketStats>> {
  const out: Record<string, RwaMarketStats> = {};
  const wanted: PriceRequestItem[] = [];

  for (const item of items) {
    const hit = cached(cacheKey(item.chain, item.address, withDepth));
    if (hit) out[item.id] = hit;
    else wanted.push(item);
  }
  if (wanted.length === 0) return out;

  const solana = wanted.filter((i) => i.chain === "solana");
  const evm = wanted.filter((i) => CHAIN_TO_ALCHEMY[i.chain]);
  const evmByChain = new Map<string, PriceRequestItem[]>();
  for (const item of evm) {
    if (!CHAIN_TO_GECKOTERMINAL[item.chain]) continue;
    const list = evmByChain.get(item.chain) ?? [];
    list.push(item);
    evmByChain.set(item.chain, list);
  }

  const [jup, alchemy, evmChange, geckoByChain] = await Promise.all([
    solana.length ? jupiterStats(solana.map((i) => i.address)) : new Map<string, RwaMarketStats>(),
    evm.length
      ? alchemyPrices(
          evm.map((i) => ({ network: CHAIN_TO_ALCHEMY[i.chain], address: i.address }))
        ).catch(() => new Map<string, number>())
      : new Map<string, number>(),
    // Jupiter hands us the Solana 24h move directly; EVM has no such feed, so
    // it comes off the same Alchemy history the chart reads, which is cached
    // and shared between the two.
    withDepth
      ? Promise.all(
          evm.map(
            async (i) =>
              [
                `${i.chain}:${i.address.toLowerCase()}`,
                change24hFrom(await fetchTokenHistory(i.chain, i.address)),
              ] as const
          )
        )
      : [],
    withDepth
      ? Promise.all(
          [...evmByChain].map(
            async ([chain, list]) =>
              [
                chain,
                await geckoTerminalStats(
                  CHAIN_TO_GECKOTERMINAL[chain],
                  list.map((i) => i.address)
                ),
              ] as const
          )
        )
      : [],
  ]);

  const record = (item: PriceRequestItem, stats: RwaMarketStats) => {
    if (stats.priceUsd == null && stats.change24h == null && stats.liquidityUsd == null) return;
    out[item.id] = stats;
    remember(cacheKey(item.chain, item.address, withDepth), stats);
  };

  for (const item of solana) {
    const stats = jup.get(item.address);
    if (stats) record(item, stats);
  }

  const geckoLookup = new Map(geckoByChain);
  const changeLookup = new Map(evmChange);
  for (const item of evm) {
    const gecko = geckoLookup.get(item.chain)?.get(item.address.toLowerCase());
    const lower = item.address.toLowerCase();
    // Alchemy is the price and 24h of record; GeckoTerminal only fills the
    // depth it alone carries, so a rate-limited response never costs a price.
    record(item, {
      liquidityUsd: gecko?.liquidityUsd,
      marketCapUsd: gecko?.marketCapUsd,
      priceUsd: alchemy.get(`${CHAIN_TO_ALCHEMY[item.chain]}:${lower}`) ?? gecko?.priceUsd,
      change24h: changeLookup.get(`${item.chain}:${lower}`) ?? gecko?.change24h,
    });
  }
  return out;
}

// Price only, for callers that just need to value a holding.
export async function fetchRwaPrices(items: PriceRequestItem[]): Promise<Record<string, number>> {
  const market = await fetchRwaMarket(items, false);
  const out: Record<string, number> = {};
  for (const [id, stats] of Object.entries(market)) {
    if (stats.priceUsd != null) out[id] = stats.priceUsd;
  }
  return out;
}
