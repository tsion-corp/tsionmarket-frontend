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
// Generous against a healthy service and tight against a hanging one: the
// status page puts this service's p95 at ~834 ms and its slowest degraded
// answer at ~3.6 s, so five seconds still clears a bad day while cutting the
// time a portfolio request spends waiting on a service that is not answering.
const TIMEOUT_MS = 5_000;

/**
 * Server-side backoff for the trade portfolio read.
 *
 * /api/portfolio answers fine without this call — a failure just means the
 * caller's own memecoins are missing from the holdings allowlist — so the
 * route keeps returning 200 and the browser's circuit breaker
 * (lib/api/circuit.ts) never opens for it. That is correct for the route and
 * wrong for this call: on 2026-09-16 the trade service stopped answering and
 * every signed-in portfolio poll still went out to it, each one holding a
 * function open for the full timeout.
 *
 * The client breaker cannot see this, because it happens on the server. So the
 * same idea lives here, in the smallest form that works: count consecutive
 * failures, and once there have been enough, skip the call outright for a
 * cooldown. The cost of a dead service falls to one request per instance per
 * minute instead of one per user per poll.
 *
 * Module state, like the Alchemy key cooldown in lib/server/alchemy-keys.ts.
 * It is per-instance and that is the point: it needs no store, and a cold
 * start simply re-learns with one request.
 */
export const TRADE_FAILURE_THRESHOLD = 3;
export const TRADE_COOLDOWN_MS = 60_000;

let consecutiveFailures = 0;
let skipUntil = 0;

function noteFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= TRADE_FAILURE_THRESHOLD) skipUntil = Date.now() + TRADE_COOLDOWN_MS;
}

function noteSuccess(): void {
  consecutiveFailures = 0;
  skipUntil = 0;
}

/** Test seam: the counters are module state, so a suite must be able to clear them. */
export function resetTradePortfolioBackoffForTest(): void {
  consecutiveFailures = 0;
  skipUntil = 0;
}

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

// `ok: false` is reported rather than folded into an empty page: an empty page
// is a user with no memecoins, a refusal is the service not answering, and the
// backoff above has to be able to tell them apart.
async function readPage(
  bearer: string,
  page: number
): Promise<{ items: RawPosition[]; total: number; ok: boolean }> {
  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  const res = await fetch(`${TRADE_BASE}/portfolio?${query.toString()}`, {
    headers: { accept: "application/json", authorization: bearer },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { items: [], total: 0, ok: false };
  const data = await res.json();
  const items: RawPosition[] = Array.isArray(data?.data?.items) ? data.data.items : [];
  const total = Number(data?.data?.meta?.total);
  return { items, total: Number.isFinite(total) ? total : items.length, ok: true };
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
  // Recently established that the service is not answering. Skipping costs the
  // caller nothing it would not already have lost, and costs the service
  // nothing at all.
  if (Date.now() < skipUntil) return { buyable, meme };

  try {
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const { items, total, ok } = await readPage(bearer, page);
      if (!ok) {
        noteFailure();
        return { buyable: {}, meme: {} };
      }
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
    // A timeout or a transport fault counts the same as a refusal: the service
    // did not answer.
    noteFailure();
    console.error("Trade portfolio registry failed:", error);
    return { buyable: {}, meme: {} };
  }
  noteSuccess();
  return { buyable, meme };
}
