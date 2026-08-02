"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { assetPriceUsd, type RwaApiAsset } from "@/lib/rwa-api";

const PRICE_STALE_MS = 60_000;

// Overlay fetched prices onto assets the backend serves without one. Pure, so
// the merge is testable without the query layer.
export function mergeFallbackPrices(
  assets: RwaApiAsset[],
  priceById: Map<string, number>
): RwaApiAsset[] {
  if (priceById.size === 0) return assets;
  return assets.map((a) => {
    const price = priceById.get(a.id);
    return price != null && assetPriceUsd(a) == null ? { ...a, priceUsd: String(price) } : a;
  });
}

// Assets with the backend's price where present, and a batched lookup filling
// the gaps (today: the whole Solana catalog ships priceUsd null). One request
// covers every missing asset — a per-asset fan-out rate-limits immediately.
export function useRwaEnrichedAssets(assets: RwaApiAsset[]): RwaApiAsset[] {
  const targets = useMemo(
    () =>
      assets
        .filter((a) => assetPriceUsd(a) == null)
        .map((a) => ({ id: a.id, chain: a.chain, address: a.address })),
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

  const { data } = useQuery<Record<string, number>>({
    queryKey: ["rwa-prices", key],
    enabled: targets.length > 0,
    staleTime: PRICE_STALE_MS,
    refetchInterval: PRICE_STALE_MS,
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
      // Throwing lets the retry engage; returning {} would cache "no prices"
      // as a success for the whole stale window.
      if (!res.ok) throw new Error("Could not load prices");
      const body = (await res.json()) as { prices?: Record<string, number> };
      return body.prices ?? {};
    },
  });

  const priceById = useMemo(() => new Map(Object.entries(data ?? {})), [data]);
  return useMemo(() => mergeFallbackPrices(assets, priceById), [assets, priceById]);
}
