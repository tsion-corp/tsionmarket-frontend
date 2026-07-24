import "server-only";
import { wsapiRwaRequest } from "@/lib/server/wsapi";

// RWA chain id -> Alchemy network id, for the chains the portfolio queries.
const RWA_CHAIN_TO_NETWORK: Record<string, string> = {
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
  solana: "solana-mainnet",
};

export interface RwaTokenInfo {
  symbol: string;
  priceUsd: number;
}

interface RwaAssetRow {
  chain?: string;
  address?: string;
  symbol?: string;
  priceUsd?: string | null;
}

// Recognized RWA tokens keyed by Alchemy network -> lowercased address, so a
// user's RWA holdings pass the portfolio allowlist and render with the right
// symbol and price. Cached upstream (60s). On any failure it returns empty, so
// the portfolio still loads (RWA rows just won't appear that fetch).
export async function fetchRwaRegistry(): Promise<Record<string, Map<string, RwaTokenInfo>>> {
  const out: Record<string, Map<string, RwaTokenInfo>> = {};
  try {
    const res = await wsapiRwaRequest("assets", { method: "GET", revalidate: 60 });
    if (!res.ok) return out;
    const body = (await res.json().catch(() => ({}))) as { data?: RwaAssetRow[] };
    for (const a of body.data ?? []) {
      const network = a.chain ? RWA_CHAIN_TO_NETWORK[a.chain] : undefined;
      if (!network || !a.address) continue;
      const price = a.priceUsd != null ? parseFloat(a.priceUsd) : 0;
      (out[network] ??= new Map()).set(a.address.toLowerCase(), {
        symbol: a.symbol ?? "RWA",
        priceUsd: Number.isFinite(price) ? price : 0,
      });
    }
  } catch {
    // Ignore — an empty registry just means no RWA rows this fetch.
  }
  return out;
}
