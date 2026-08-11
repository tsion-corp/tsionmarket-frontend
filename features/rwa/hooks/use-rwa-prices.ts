"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { mergeMarket, type RwaAssetView, type RwaMarketStats } from "@/features/rwa/lib/presenter";
import type { RwaApiAsset } from "@/features/rwa/lib/api";

const MARKET_STALE_MS = 60_000;

// Assets carrying live market stats — price, 24h change, pool liquidity, market
// cap — for every row. The RWA backend serves a price for almost none of them,
// an APY for three and a TVL for one, so one batched request covers the rest;
// a per-asset fan-out rate-limits immediately.
export function useRwaEnrichedAssets(assets: RwaApiAsset[]): RwaAssetView[] {
  const targets = useMemo(
    () => assets.map((a) => ({ id: a.id, chain: a.chain, address: a.address })),
    [assets]
  );

  // Keyed by the asset set, so the query re-runs when the catalog changes but
  // not on every render.
  const key = useMemo(
    () =>
      targets
        .map((t) => t.id)
        .sort()
        .join(","),
    [targets]
  );

  const { data } = useQuery<Record<string, RwaMarketStats>>({
    queryKey: ["rwa-market", key],
    enabled: targets.length > 0,
    staleTime: MARKET_STALE_MS,
    refetchInterval: MARKET_STALE_MS,
    retry: 1,
    queryFn: async () => {
      const res = await apiFetch(
        "/api/rwa-prices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: targets }),
        },
        { requireAuth: true }
      );
      // Throwing lets the retry engage; returning {} would cache "no data"
      // as a success for the whole stale window.
      if (!res.ok) throw new Error("Could not load market data");
      const body = (await res.json()) as { market?: Record<string, RwaMarketStats> };
      return body.market ?? {};
    },
  });

  const byId = useMemo(() => new Map(Object.entries(data ?? {})), [data]);
  return useMemo(() => mergeMarket(assets, byId), [assets, byId]);
}
