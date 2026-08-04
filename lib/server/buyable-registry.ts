import "server-only";
import { dextopusRequest } from "@/lib/server/dextopus";

// The tokens a user can buy and have delivered, grouped by Alchemy network id as
// a set of lowercased addresses. This extends the portfolio allowlist so a bought
// asset shows in holdings on the network it settled on, instead of being filtered
// out as an unknown token. Sourced from the live Dextopus destination catalog
// (origin USDC on Base) and cached, mirroring the RWA registry.

export type BuyableRegistry = Record<string, Set<string>>;

// Display metadata for trade-catalog memecoins, keyed like the registry.
// Alchemy has no logo and often no price for these, but the catalog does.
export interface MemeTokenInfo {
  logo: string | null;
  priceUsd: number;
}
export type MemeRegistry = Record<string, Map<string, MemeTokenInfo>>;

// Alchemy network id per Dextopus chain id, limited to the chains we display in
// holdings. Keep in sync with SUPPORTED_CHAINS in lib/buy.ts.
const CHAIN_TO_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
  137: "polygon-mainnet",
  792703809: "solana-mainnet",
};

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface RawDestination {
  destinationChainId: number;
  currency?: string;
}

const TRADE_BASE =
  process.env.NEXT_PUBLIC_TRADE_API_URL ?? "https://api.worldstreetwebservices.com/v1/trade";

// Memecoins from the trade service's catalog: a bought token is a legitimate
// holding the Dextopus catalog doesn't know about. Catalog entries persist
// from searches and trades, so anything a user traded is here.
async function addTradeCatalog(out: BuyableRegistry, meta: MemeRegistry): Promise<void> {
  if (!TRADE_BASE) return;
  try {
    const res = await fetch(`${TRADE_BASE}/tokens?page=1&limit=100`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return;
    const data = await res.json();
    const items: Array<{
      chainId?: number;
      address?: string;
      logoUrl?: string | null;
      priceUsd?: string | null;
    }> = Array.isArray(data?.data?.items) ? data.data.items : [];
    for (const t of items) {
      if (t.chainId !== 8453 || typeof t.address !== "string") continue;
      const address = t.address.toLowerCase();
      (out["base-mainnet"] ??= new Set()).add(address);
      const priceUsd = t.priceUsd ? Number(t.priceUsd) : 0;
      (meta["base-mainnet"] ??= new Map()).set(address, {
        logo: t.logoUrl ?? null,
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
      });
    }
  } catch {
    // A registry failure must never break the portfolio.
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
