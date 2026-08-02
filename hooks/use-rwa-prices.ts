"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { assetPriceUsd, type RwaApiAsset } from "@/lib/rwa-api";
import { coingeckoPlatform } from "@/lib/coingecko";

const PRICE_STALE_MS = 5 * 60_000;

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

async function fetchTokenPrice(platform: string, address: string): Promise<number | null> {
  const res = await fetch(
    `/api/token-price?platform=${encodeURIComponent(platform)}&address=${encodeURIComponent(address)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { priceUsd?: number | null };
  return typeof data.priceUsd === "number" ? data.priceUsd : null;
}

// Assets with the backend's price where present, and a CoinGecko contract
// lookup filling the gaps (today: the Solana catalog ships priceUsd null).
// Rows without a resolvable price keep showing the dash.
export function useRwaEnrichedAssets(assets: RwaApiAsset[]): RwaApiAsset[] {
  const targets = useMemo(
    () => assets.filter((a) => assetPriceUsd(a) == null && coingeckoPlatform(a.chain) != null),
    [assets]
  );

  const results = useQueries({
    queries: targets.map((a) => ({
      queryKey: ["token-price", a.chain, a.address],
      queryFn: () => fetchTokenPrice(coingeckoPlatform(a.chain) as string, a.address),
      staleTime: PRICE_STALE_MS,
      retry: 1,
    })),
  });

  const priceById = new Map<string, number>();
  targets.forEach((a, i) => {
    const price = results[i]?.data;
    if (typeof price === "number" && price > 0) priceById.set(a.id, price);
  });
  return mergeFallbackPrices(assets, priceById);
}
