"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

const HREF = "/rwa";

// The real-assets brief. The server runs the same listable/dedupe/enrich rules
// the full section does (lib/rwa/catalog), so what is tradable stays decided
// by the data layer and no screen can widen it. The full page then sorts and
// filters on top, so these rows are a sample of that set rather than its
// first four rows. Read from the dashboard feed.
export function RwaOverview({ rows }: { rows: number }) {
  const t = useTranslations("rwa");
  const tOverview = useTranslations("overview");
  const { data: feed, isPending } = useDashboardFeed();

  if (isPending && !feed) return <PreviewRowSkeleton rows={rows} />;
  const assets = feed?.rwa ?? null;
  if (assets === null) return <PreviewNotice>{t("registryUnavailable")}</PreviewNotice>;
  const top = assets.slice(0, rows);
  if (top.length === 0) return <PreviewNotice>{tOverview("empty")}</PreviewNotice>;

  return (
    <>
      {top.map((asset) => (
        <PreviewRow
          key={asset.id}
          href={HREF}
          sym={asset.symbol}
          name={asset.name}
          logo={asset.logo}
          bg={tokenBg(asset.symbol)}
          price={asset.priceUsd != null ? formatUsd(asset.priceUsd) : "—"}
          change={asset.change24h}
        />
      ))}
    </>
  );
}
