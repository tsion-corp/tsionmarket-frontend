import "server-only";
import { wsapiService } from "@/lib/wsapi-base";
import type { BuyableRegistry, MemeRegistry } from "@/lib/server/buyable-registry";

// The memecoins the signed-in user actually holds, from the trade service's
// own record of their confirmed swaps.
//
// The holdings allowlist used to learn about memecoins from one page of the
// public catalogue (lib/server/buyable-registry's addTradeCatalog). On
// 2026-09-15 that catalogue held 121,383 tokens and the page held 100, of
// which 67 were on Base: a coin bought outside that slice was filtered out of
// its owner's own portfolio, which is what users were reporting. Paging the
// catalogue to find it would be over a thousand calls for an answer the
// service already has.
//
// /portfolio is that answer. It is scoped server-side to the identity the
// bearer names, built from confirmed swaps only, and independent of discovery
// and trending, so a coin stays in it after it stops trending and after the
// position is closed. One page of 100 covers any real holder; the walk stops
// at PAGE_LIMIT pages so a pathological account cannot hold the portfolio
// read open.
//
// See the trade service contract (llms.txt), "Portfolio, profit/loss, and
// complete user activity".

const TRADE_BASE = process.env.NEXT_PUBLIC_TRADE_API_URL ?? wsapiService("trade");

/** The contract's maximum page size for /portfolio. */
const LIMIT = 100;
/** Pages to walk at most: 500 positions, well past any real account. */
const PAGE_LIMIT = 5;
const TIMEOUT_MS = 8_000;

// The contract's chain slug to the Alchemy network id the portfolio speaks.
const CHAIN_TO_NETWORK: Record<string, string> = {
  base: "base-mainnet",
  solana: "solana-mainnet",
};

interface RawPosition {
  chain?: string;
  address?: string;
  logoUrl?: string | null;
  currentPriceUsd?: string | null;
}

// A null price means the providers cannot value the coin right now. It is not
// zero, and the registry only uses this figure to fill a price Alchemy did not
// have, so 0 here means "nothing to add", never "worthless".
function priceOf(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function readPage(
  bearer: string,
  page: number
): Promise<{ items: RawPosition[]; total: number }> {
  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  const res = await fetch(`${TRADE_BASE}/portfolio?${query.toString()}`, {
    headers: { accept: "application/json", authorization: bearer },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { items: [], total: 0 };
  const data = await res.json();
  const items: RawPosition[] = Array.isArray(data?.data?.items) ? data.data.items : [];
  const total = Number(data?.data?.meta?.total);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

/**
 * The user's own positions as portfolio registries.
 *
 * Never throws and never rejects: the trade service being down, slow or
 * refusing the bearer must not blank a portfolio the chain can still answer.
 * The address is lowercased for the registry's case-insensitive lookup, as
 * every other entry is. That is a local key only; the address shown to the
 * user and sent back to the service is always the chain's own casing, which
 * matters for Solana mints.
 */
export async function fetchMemePositions(
  bearer: string | null
): Promise<{ buyable: BuyableRegistry; meme: MemeRegistry }> {
  const buyable: BuyableRegistry = {};
  const meme: MemeRegistry = {};
  if (!bearer || !TRADE_BASE) return { buyable, meme };

  try {
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const { items, total } = await readPage(bearer, page);
      for (const row of items) {
        const network = CHAIN_TO_NETWORK[row.chain ?? ""];
        if (!network || typeof row.address !== "string" || row.address === "") continue;
        const key = row.address.toLowerCase();
        (buyable[network] ??= new Set()).add(key);
        (meme[network] ??= new Map()).set(key, {
          logo: row.logoUrl ?? null,
          priceUsd: priceOf(row.currentPriceUsd),
        });
      }
      if (items.length === 0 || page * LIMIT >= total) break;
    }
  } catch (error) {
    console.error("Trade portfolio registry failed:", error);
    return { buyable: {}, meme: {} };
  }
  return { buyable, meme };
}
