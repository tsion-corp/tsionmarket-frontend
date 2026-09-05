"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

const HREF = "/spot";

// The spot brief: the largest markets by cap, which is the order the full list
// opens in, so the first rows here are the first rows there.
export function SpotOverview({ rows }: { rows: number }) {
  const t = useTranslations("markets");
  const tOverview = useTranslations("overview");
  const { markets, loading, error } = useSpotMarkets();
  const top = markets.slice(0, rows);

  if (loading) return <PreviewRowSkeleton rows={rows} />;
  if (error) return <PreviewNotice>{t("marketsUnavailable")}</PreviewNotice>;
  if (top.length === 0) return <PreviewNotice>{tOverview("empty")}</PreviewNotice>;

  return (
    <>
      {top.map((m) => (
        <PreviewRow
          key={m.symbol}
          href={HREF}
          sym={m.symbol}
          name={m.name}
          logo={m.logo}
          bg={tokenBg(m.symbol)}
          price={m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—"}
          change={m.change24h}
        />
      ))}
    </>
  );
}
