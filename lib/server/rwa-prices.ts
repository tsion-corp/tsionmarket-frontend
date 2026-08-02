import "server-only";

// Prices for catalog assets the RWA backend serves without one (every Solana
// row today). Batched by source so a page load costs two upstream calls total,
// never one per asset: fanning out per address rate-limited instantly.
//
// Solana goes to Jupiter, which prices the xStocks and Ondo mints that generic
// token-price APIs do not carry. EVM goes to Alchemy's by-address prices, the
// same premium key the portfolio already uses.

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const JUPITER_BATCH = 50;
const ALCHEMY_BATCH = 25;
const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

export interface PriceRequestItem {
  // The asset's own id, echoed back so the client can map without re-deriving.
  id: string;
  chain: string;
  address: string;
}

const cache = new Map<string, { expires: number; price: number }>();

function cached(key: string): number | undefined {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.price;
  if (hit) cache.delete(key);
  return undefined;
}

function remember(key: string, price: number): void {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, price });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function jupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    chunk(mints, JUPITER_BATCH).map(async (batch) => {
      try {
        const res = await fetch(`${JUPITER_PRICE_URL}?ids=${batch.join(",")}`, {
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, { usdPrice?: number }>;
        for (const [mint, value] of Object.entries(data ?? {})) {
          const price = value?.usdPrice;
          if (typeof price === "number" && price > 0) out.set(mint, price);
        }
      } catch {
        // A missing price renders as a dash; it must never fail the page.
      }
    })
  );
  return out;
}

async function alchemyPrices(
  items: { network: string; address: string }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return out;

  await Promise.all(
    chunk(items, ALCHEMY_BATCH).map(async (batch) => {
      try {
        const res = await fetch(`https://api.g.alchemy.com/prices/v1/${key}/tokens/by-address`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: batch }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          data?: {
            network: string;
            address: string;
            prices?: { currency: string; value: string }[];
          }[];
        };
        for (const row of data?.data ?? []) {
          const usd = row.prices?.find((p) => p.currency === "usd");
          const price = usd ? parseFloat(usd.value) : NaN;
          if (Number.isFinite(price) && price > 0) {
            out.set(`${row.network}:${row.address.toLowerCase()}`, price);
          }
        }
      } catch {
        // Same: partial results are fine.
      }
    })
  );
  return out;
}

const CHAIN_TO_NETWORK: Record<string, string> = {
  base: "base-mainnet",
  ethereum: "eth-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
};

// Price per requested asset id. Assets with no resolvable price are simply
// absent, and the row keeps its dash.
export async function fetchRwaPrices(items: PriceRequestItem[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const wanted: PriceRequestItem[] = [];

  for (const item of items) {
    const hit = cached(`${item.chain}:${item.address.toLowerCase()}`);
    if (hit !== undefined) out[item.id] = hit;
    else wanted.push(item);
  }
  if (wanted.length === 0) return out;

  const solana = wanted.filter((i) => i.chain === "solana");
  const evm = wanted.filter((i) => CHAIN_TO_NETWORK[i.chain]);

  const [jup, alch] = await Promise.all([
    solana.length ? jupiterPrices(solana.map((i) => i.address)) : new Map<string, number>(),
    evm.length
      ? alchemyPrices(evm.map((i) => ({ network: CHAIN_TO_NETWORK[i.chain], address: i.address })))
      : new Map<string, number>(),
  ]);

  for (const item of solana) {
    const price = jup.get(item.address);
    if (price != null) {
      out[item.id] = price;
      remember(`${item.chain}:${item.address.toLowerCase()}`, price);
    }
  }
  for (const item of evm) {
    const price = alch.get(`${CHAIN_TO_NETWORK[item.chain]}:${item.address.toLowerCase()}`);
    if (price != null) {
      out[item.id] = price;
      remember(`${item.chain}:${item.address.toLowerCase()}`, price);
    }
  }
  return out;
}
