import "server-only";
import { wsapiRwaRequest } from "@/lib/server/wsapi";
import { fetchRwaPrices } from "@/lib/server/rwa-prices";

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
  // Same server-resolved logo the RWA table uses, so holdings show a real icon.
  logo: string;
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
    // Cached 5 minutes: the portfolio refetches often (every 30s and after each
    // trade), and the RWA token list barely changes — so this must not re-hit the
    // RWA backend on every portfolio load.
    const res = await wsapiRwaRequest("assets", { method: "GET", revalidate: 300 });
    if (!res.ok) {
      // Silence here would delete every RWA holding from the portfolio and
      // with it the only path to sell one, so say so.
      console.error("RWA registry fetch failed:", res.status);
      return out;
    }
    const body = (await res.json().catch(() => ({}))) as { data?: RwaAssetRow[] };
    const rows = (body.data ?? []).filter((a) => a.chain && a.address);

    // The backend serves no price for the whole Solana catalog, and a holding
    // priced at zero is invisible in the portfolio total. Fill those the same
    // way the table does, in one batched call.
    const unpriced = rows.filter((a) => {
      const p = a.priceUsd != null ? parseFloat(a.priceUsd) : NaN;
      return !Number.isFinite(p) || p <= 0;
    });
    const fallback = unpriced.length
      ? await fetchRwaPrices(
          unpriced.map((a) => ({
            id: `${a.chain}:${a.address}`,
            chain: a.chain as string,
            address: a.address as string,
          }))
        ).catch(() => ({}) as Record<string, number>)
      : {};

    for (const a of rows) {
      const network = a.chain ? RWA_CHAIN_TO_NETWORK[a.chain] : undefined;
      if (!network || !a.address) continue;
      const parsed = a.priceUsd != null ? parseFloat(a.priceUsd) : NaN;
      const price =
        Number.isFinite(parsed) && parsed > 0 ? parsed : (fallback[`${a.chain}:${a.address}`] ?? 0);
      (out[network] ??= new Map()).set(a.address.toLowerCase(), {
        symbol: a.symbol ?? "RWA",
        priceUsd: price,
        logo: `/api/token-logo/${a.chain}/${a.address}`,
      });
    }
  } catch (error) {
    console.error("RWA registry fetch failed:", error);
  }
  return out;
}
