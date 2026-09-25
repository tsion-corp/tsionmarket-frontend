import "server-only";
import { CATALOG_PAGE_LIMIT, nextCatalogPage, type Paged } from "@/lib/meme/catalog";
import { dextopusRequest } from "@/lib/server/dextopus";
import { wsapiService } from "@/lib/wsapi-base";

// The tokens a user can buy and have delivered, grouped by Alchemy network id as
// a set of lowercased addresses. This extends the portfolio allowlist so a bought
// asset shows in holdings on the network it settled on, instead of being filtered
// out as an unknown token. Sourced from the live Dextopus destination catalog
// (origin USDC on Base) and cached, mirroring the RWA registry.

export type BuyableRegistry = Record<string, Set<string>>;

// Display metadata for trade-catalog memecoins, keyed like the registry.
// Alchemy has no logo and often no price for these, but the catalog does.
// `priceUsd` is null when the catalogue has no price for the coin: per the
// trade contract, null means "not currently available", never zero.
export interface MemeTokenInfo {
  logo: string | null;
  priceUsd: number | null;
}
export type MemeRegistry = Record<string, Map<string, MemeTokenInfo>>;

// Alchemy network id per Dextopus chain id, limited to the chains we display
// in holdings. Keep in sync with SUPPORTED_CHAINS in lib/buy.ts and
// EVM_NETWORKS in lib/server/alchemy.ts — a chain id here with no matching
// EVM_NETWORKS entry would build a route the portfolio Alchemy call itself
// rejects.
const CHAIN_TO_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
  137: "polygon-mainnet",
  792703809: "solana-mainnet",
  33139: "apechain-mainnet",
  80094: "berachain-mainnet",
  56: "bnb-mainnet",
  42220: "celo-mainnet",
  685689: "gensyn-mainnet",
  999: "hyperliquid-mainnet",
  57073: "ink-mainnet",
  143: "monad-mainnet",
  4663: "robinhood-mainnet",
  360: "shape-mainnet",
  1868: "soneium-mainnet",
  130: "unichain-mainnet",
  480: "worldchain-mainnet",
  100: "gnosis-mainnet",
  59144: "linea-mainnet",
  324: "zksync-mainnet",
  534352: "scroll-mainnet",
  43114: "avax-mainnet",
  81457: "blast-mainnet",
  7777777: "zora-mainnet",
  2020: "ronin-mainnet",
  2741: "abstract-mainnet",
  42018: "mythos-mainnet",
};

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface RawDestination {
  destinationChainId: number;
  currency?: string;
}

const TRADE_BASE = process.env.NEXT_PUBLIC_TRADE_API_URL ?? wsapiService("trade");

// Memecoins from the trade service's catalog: a bought token is a legitimate
// holding the Dextopus catalog doesn't know about. Catalog entries persist
// from searches and trades, so anything a user traded is here.
//
// Walked a Base page of 500 at a time until the server's total, per the
// contract. It read page 1 of 100 before, so a coin bought from row 101 onward
// was never a holding. Bounded at 20 pages (10,000 rows): Base listed 14,343
// on 2026-09-14, so the tail past that is still missed, and each page is
// revalidated every ten minutes. A stopgap: slice 5 of
// ADR-2026-09-14-memecoins-trade-contract makes the service's /portfolio the
// source of truth for held memecoins, and this path the fallback for coins
// that arrived outside it.
const REGISTRY_MAX_PAGES = 20;
const REGISTRY_REVALIDATE_S = 600;

interface RawCatalogRow {
  chainId?: number;
  address?: string;
  logoUrl?: string | null;
  priceUsd?: string | null;
}

// The catalogue's decimal-string price as a number for the Alchemy path's
// valuation, or null when there is none or it cannot be read. Never 0 for a
// missing price: that is what valued an unpriced holding at $0.00.
function catalogPrice(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

function readMeta(value: unknown): Paged<unknown>["meta"] | null {
  if (!value || typeof value !== "object") return null;
  const { page, limit, total } = value as Record<string, unknown>;
  if (typeof page !== "number" || typeof limit !== "number" || typeof total !== "number") {
    return null;
  }
  return { page, limit, total };
}

async function addTradeCatalog(out: BuyableRegistry, meta: MemeRegistry): Promise<void> {
  if (!TRADE_BASE) return;
  for (let page = 1; page <= REGISTRY_MAX_PAGES; page += 1) {
    const url = `${TRADE_BASE}/tokens?page=${page}&limit=${CATALOG_PAGE_LIMIT}&chain=base`;
    let body: { data?: { items?: unknown; meta?: unknown } } | null;
    try {
      const res = await fetch(url, {
        next: { revalidate: REGISTRY_REVALIDATE_S },
        // Bounded: an upstream that has not answered in 8s is not going to, and
        // an unbounded read holds the function open for as long as the upstream
        // feels like — which is how an outage becomes a bill.
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.warn(
          `[buyable-registry] trade catalogue page ${page} answered ${res.status}; the meme allowlist stops at ${page - 1} page(s)`
        );
        return;
      }
      body = await res.json();
    } catch (error) {
      // A registry failure must never break the portfolio, so the pages
      // already read are kept; it is logged, not swallowed.
      console.warn(
        `[buyable-registry] trade catalogue page ${page} failed; the meme allowlist stops at ${page - 1} page(s):`,
        error
      );
      return;
    }
    const items: RawCatalogRow[] = Array.isArray(body?.data?.items) ? body.data.items : [];
    for (const t of items) {
      if (t.chainId !== 8453 || typeof t.address !== "string") continue;
      const address = t.address.toLowerCase();
      (out["base-mainnet"] ??= new Set()).add(address);
      (meta["base-mainnet"] ??= new Map()).set(address, {
        logo: t.logoUrl ?? null,
        priceUsd: catalogPrice(t.priceUsd),
      });
    }
    const pageMeta = readMeta(body?.data?.meta);
    if (!pageMeta) {
      console.warn(`[buyable-registry] trade catalogue page ${page} carried no meta; stopping`);
      return;
    }
    if (nextCatalogPage(pageMeta) === undefined) return;
  }
}

export async function fetchBuyableRegistry(): Promise<{
  buyable: BuyableRegistry;
  meme: MemeRegistry;
}> {
  const query = new URLSearchParams({ originChainId: "8453", originAddress: BASE_USDC });
  const out: BuyableRegistry = {};
  const meme: MemeRegistry = {};
  try {
    const res = await dextopusRequest("deposit/destinations", {
      method: "GET",
      purpose: "trade",
      query,
      revalidate: 600,
    });
    if (res.ok) {
      const data = await res.json();
      const rows: RawDestination[] = Array.isArray(data?.destinations) ? data.destinations : [];
      for (const r of rows) {
        const network = CHAIN_TO_NETWORK[r.destinationChainId];
        const address = r.currency?.toLowerCase();
        // Native tokens are already allowed via the tracked-chain check, so skip the
        // native sentinel; it is not a real ERC-20 address.
        if (!network || !address || address === ZERO_ADDRESS) continue;
        (out[network] ??= new Set()).add(address);
      }
    }
  } catch {
    // A registry failure must never break the portfolio; fall back to the static
    // allowlist plus whatever was collected.
  }
  await addTradeCatalog(out, meme);
  return { buyable: out, meme };
}

// ── Held tokens the paged catalogue never reached ────────────────────────────
//
// The allowlist above is the top of a RANKED list: a token the wallet holds
// but that sits past the pages read (staging ranks a coin with no 24h volume
// around row 7,800 of 19,000) is invisible to the portfolio, and so to the
// migration sweep. Seen live: the same wallet showed $1.96 of Base memecoins
// on production and nothing on staging.
//
// The legacy-wallet read therefore asks the catalogue about each held Base
// token BY ADDRESS. The lookup resolves any real ERC-20 contract (it 404s
// only for a non-contract), so "known" is not the bar — a token is admitted
// when the platform would let the user SELL it and quotes a price for it.
// Spam and honeypots have neither. Bounded: at most CONFIRM_MAX addresses per
// read (an old wallet that traded memecoins carries a hundred-odd airdrops
// beside them), each answer cached for ten minutes either way, so a repeat
// read costs nothing.
const CONFIRM_MAX = 200;
const CONFIRM_TTL_MS = 600_000;
const CONFIRM_TIMEOUT_MS = 5_000;
const CONFIRM_CONCURRENCY = 10;

const confirmCache = new Map<string, { at: number; value: MemeTokenInfo | null }>();

interface RawTokenLookup {
  address?: string;
  logoUrl?: string | null;
  priceUsd?: string | null;
  sellEnabled?: boolean;
}

async function lookupBaseToken(address: string): Promise<MemeTokenInfo | null> {
  const hit = confirmCache.get(address);
  if (hit && Date.now() - hit.at < CONFIRM_TTL_MS) return hit.value;
  let value: MemeTokenInfo | null = null;
  try {
    const res = await fetch(`${TRADE_BASE}/tokens/${address}?chain=base`, {
      signal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: RawTokenLookup };
      const row = body.data;
      const price = catalogPrice(row?.priceUsd);
      if (row?.sellEnabled === true && price !== null && price > 0) {
        value = { logo: row.logoUrl ?? null, priceUsd: price };
      }
    }
  } catch {
    // Unreachable or slow: not admitted this read, and not remembered as a
    // "no" either — the next read asks again.
    return null;
  }
  confirmCache.set(address, { at: Date.now(), value });
  return value;
}

/**
 * Which of `addresses` (lowercased Base contracts) the platform can sell and
 * price. Returned in the MemeRegistry shape so the portfolio values and
 * decorates them exactly like a catalogue-listed coin.
 */
export async function confirmBaseTokens(
  addresses: readonly string[],
  // How many addresses this caller may spend. The migration reads a wallet a
  // handful of times ever and wants the long tail; the portfolio reads every
  // wallet on the app's slow clock and wants the bill bounded, so it asks for
  // less. Either way the answers are cached per address, so the second caller
  // of the same wallet pays almost nothing.
  max: number = CONFIRM_MAX
): Promise<Map<string, MemeTokenInfo>> {
  const out = new Map<string, MemeTokenInfo>();
  if (!TRADE_BASE) return out;
  const queue = [...new Set(addresses)].slice(0, max);
  const workers = Array.from({ length: Math.min(CONFIRM_CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const confirmed = await lookupBaseToken(next);
      if (confirmed) out.set(next, confirmed);
    }
  });
  await Promise.all(workers);
  return out;
}
