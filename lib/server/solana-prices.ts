import "server-only";

import { cached } from "@/lib/server/response-cache";

// Prices for Solana mints Alchemy leaves unpriced, from DefiLlama's current
// price feed. Keyless, addressed by `solana:<mint>`, and it carries a
// confidence figure — a thin pool priced off one trade reports low.
//
// Why it exists: the migration reads the OLD wallet whole, and on Base it
// admits a held token when the platform can sell it. There is no Solana
// catalogue to ask, so a Solana mint is admitted when it has a price. Alchemy
// prices the majors and almost nothing else (seen live: a wallet holding
// 5,600 PRCL, a token with a real market, came back with no price and was
// dropped as dust). This asks the second source before giving up on a mint.
const LLAMA_CURRENT = "https://coins.llama.fi/prices/current";
const TIMEOUT_MS = 8_000;
/** DefiLlama reports 0–1; below this the price is a guess off a thin pool. */
const MIN_CONFIDENCE = 0.8;
/** Mints per request. The endpoint takes many; keep a URL well under any limit. */
const BATCH = 50;
/** A migration reads a wallet a handful of times ever; ten minutes is plenty. */
const TTL_MS = 10 * 60 * 1000;

interface LlamaCoin {
  price?: number;
  confidence?: number;
}

/**
 * USD price per mint, for the mints DefiLlama prices with confidence; a mint
 * it does not know is simply absent. Never throws — a price outage means
 * "no second opinion", and the caller falls back to Alchemy's answer.
 */
export async function fetchSolanaMintPrices(
  mints: readonly string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(mints.filter((m) => m.length > 0))];
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const key = `solana-prices:${slice.join(",")}`;
    const prices = await cached(key, () => load(slice), TTL_MS).catch(
      () => new Map<string, number>()
    );
    for (const [mint, price] of prices) out.set(mint, price);
  }
  return out;
}

async function load(mints: readonly string[]): Promise<Map<string, number>> {
  const ids = mints.map((m) => `solana:${m}`).join(",");
  const res = await fetch(`${LLAMA_CURRENT}/${encodeURIComponent(ids)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DefiLlama answered ${res.status}`);
  const body = (await res.json()) as { coins?: Record<string, LlamaCoin> };
  const out = new Map<string, number>();
  for (const mint of mints) {
    const coin = body.coins?.[`solana:${mint}`];
    if (!coin || typeof coin.price !== "number" || !(coin.price > 0)) continue;
    if (typeof coin.confidence === "number" && coin.confidence < MIN_CONFIDENCE) continue;
    out.set(mint, coin.price);
  }
  return out;
}
