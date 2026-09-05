"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { useListedRwaAssets } from "@/features/rwa/hooks/use-rwa-assets";
import { useRwaEnrichedAssets } from "@/features/rwa/hooks/use-rwa-prices";
import { dedupeByChain } from "@/features/rwa/lib/presenter";
import { assetPriceUsd } from "@/features/rwa/lib/api";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

const HREF = "/rwa";

// The real-assets brief. It runs the same listable/dedupe/enrich pipeline the
// full section does, so what is tradable stays decided by the data layer and no
// screen can widen it. The full page then sorts and filters on top, so these
// four are a sample of that set rather than its first four rows.
export function RwaOverview({ rows }: { rows: number }) {
  const t = useTranslations("rwa");
  const tOverview = useTranslations("overview");
  const { assets, loading, error } = useListedRwaAssets();
  const tradable = useMemo(() => dedupeByChain(assets), [assets]);
  const enriched = useRwaEnrichedAssets(tradable);
  const top = useMemo(() => enriched.slice(0, rows), [enriched, rows]);
  const logos = useTokenLogos(
    useMemo(() => top.map((a) => ({ chain: a.chain, address: a.address })), [top])
  );

  if (loading) return <PreviewRowSkeleton rows={rows} />;
  if (error) return <PreviewNotice>{t("registryUnavailable")}</PreviewNotice>;
  if (top.length === 0) return <PreviewNotice>{tOverview("empty")}</PreviewNotice>;

  return (
    <>
      {top.map((asset) => {
        const price = assetPriceUsd(asset);
        return (
          <PreviewRow
            key={asset.id}
            href={HREF}
            sym={asset.symbol}
            name={asset.name}
            logo={logos[tokenLogoKey(asset.chain, asset.address)]}
            bg={tokenBg(asset.symbol)}
            price={price != null ? formatUsd(price) : "—"}
            change={asset.market?.change24h ?? null}
          />
        );
      })}
    </>
  );
}
