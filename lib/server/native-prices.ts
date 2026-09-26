import "server-only";

import { cached } from "@/lib/server/response-cache";

// Prices for native coins Alchemy leaves unpriced, from DefiLlama's current
// price feed addressed by CoinGecko id. Same feed and same confidence rule as
// lib/server/solana-prices.ts, for the other gap it left open.
//
// Why it exists: Alchemy returned a wallet's HYPE on HyperEVM with its balance
// and no price. Unpriced, the holding was worth $0.00 to everything downstream:
// the migration's "worth moving" floor (one cent) stopped offering the old
// wallet, and the portfolio showed a coin it could not value. A native coin
// with a real market and no price is a feed gap, not a worthless balance.
const LLAMA_CURRENT = "https://coins.llama.fi/prices/current";
const TIMEOUT_MS = 8_000;
const MIN_CONFIDENCE = 0.8;
const TTL_MS = 5 * 60 * 1000;

// Alchemy network label -> CoinGecko id of the chain's native coin. Only the
// ones that have needed it or plausibly will; a network absent here simply
// keeps Alchemy's answer. ETH-native L2s are left out on purpose: Alchemy
// prices ETH everywhere.
const NATIVE_COINGECKO_ID: Record<string, string> = {
  "hyperliquid-mainnet": "hyperliquid",
  "apechain-mainnet": "apecoin",
  "berachain-mainnet": "berachain-bera",
  "bnb-mainnet": "binancecoin",
  "celo-mainnet": "celo",
  "gnosis-mainnet": "xdai",
  "avax-mainnet": "avalanche-2",
  "ronin-mainnet": "ronin",
  "polygon-mainnet": "polygon-ecosystem-token",
};

interface LlamaCoin {
  price?: number;
  confidence?: number;
}

/**
 * USD price per network for the native coins DefiLlama prices with confidence;
 * a network it does not know, or one not mapped above, is simply absent.
 * Never throws — an outage means "no second opinion".
 */
export async function fetchNativePrices(networks: readonly string[]): Promise<Map<string, number>> {
  const wanted = [...new Set(networks.filter((n) => n in NATIVE_COINGECKO_ID))];
  if (wanted.length === 0) return new Map();
  const key = `native-prices:${wanted.slice().sort().join(",")}`;
  return cached(key, () => load(wanted), TTL_MS).catch(() => new Map<string, number>());
}

async function load(networks: readonly string[]): Promise<Map<string, number>> {
  const ids = networks.map((n) => `coingecko:${NATIVE_COINGECKO_ID[n]}`).join(",");
  const res = await fetch(`${LLAMA_CURRENT}/${encodeURIComponent(ids)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DefiLlama answered ${res.status}`);
  const body = (await res.json()) as { coins?: Record<string, LlamaCoin> };
  const out = new Map<string, number>();
  for (const network of networks) {
    const coin = body.coins?.[`coingecko:${NATIVE_COINGECKO_ID[network]}`];
    if (!coin || typeof coin.price !== "number" || !(coin.price > 0)) continue;
    if (typeof coin.confidence === "number" && coin.confidence < MIN_CONFIDENCE) continue;
    out.set(network, coin.price);
  }
  return out;
}
