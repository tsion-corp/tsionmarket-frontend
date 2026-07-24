"use client";

import { useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useRwaAssets } from "@/hooks/use-rwa-assets";
import { useMarketTokens } from "@/hooks/use-market-tokens";
import { rwaLogoUrl } from "@/lib/rwa-api";

export type SearchKind = "holding" | "rwa" | "market";

export interface SearchResult {
  kind: SearchKind;
  key: string;
  symbol: string;
  name: string;
  logo: string | null;
  sub: string;
  sectionId: string;
}

export interface SearchGroups {
  holdings: SearchResult[];
  rwa: SearchResult[];
  markets: SearchResult[];
  total: number;
}

const PER_GROUP = 5;

const NETWORK_LABELS: Record<string, string> = {
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function matches(q: string, ...fields: string[]): boolean {
  return fields.some((f) => f.toLowerCase().includes(q));
}

// Aggregates a query across the user's holdings, the RWA registry, and popular
// market tokens. All three sources are already cached, so this reuses them.
export function useGlobalSearch(query: string): SearchGroups {
  const { tokens } = usePortfolio();
  const { assets } = useRwaAssets();
  const { data: markets = [] } = useMarketTokens("popular");

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return { holdings: [], rwa: [], markets: [], total: 0 };

    const holdings: SearchResult[] = tokens
      .filter((t) => matches(q, t.symbol, t.name))
      .slice(0, PER_GROUP)
      .map((t) => ({
        kind: "holding",
        key: `h-${t.symbol}-${t.network}`,
        symbol: t.symbol,
        name: t.name,
        logo: t.logo,
        sub: NETWORK_LABELS[t.network] ?? t.network,
        sectionId: "portfolio",
      }));

    const rwa: SearchResult[] = assets
      .filter((a) => matches(q, a.symbol, a.name, a.issuer))
      .slice(0, PER_GROUP)
      .map((a) => ({
        kind: "rwa",
        key: `r-${a.id}`,
        symbol: a.symbol,
        name: a.name,
        logo: rwaLogoUrl(a),
        sub: a.issuer,
        sectionId: "rwa",
      }));

    const marketResults: SearchResult[] = markets
      .filter((m) => matches(q, m.symbol, m.name))
      .slice(0, PER_GROUP)
      .map((m) => ({
        kind: "market",
        key: `m-${m.id}`,
        symbol: m.symbol,
        name: m.name,
        logo: m.logo,
        sub: "Markets",
        sectionId: "markets",
      }));

    return {
      holdings,
      rwa,
      markets: marketResults,
      total: holdings.length + rwa.length + marketResults.length,
    };
  }, [query, tokens, assets, markets]);
}
