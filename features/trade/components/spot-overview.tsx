"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

const HREF = "/spot";

// The spot brief: the largest markets by cap, which is the order the full list
// opens in, so the first rows here are the first rows there. Read from the
// dashboard feed, which the server composes once for everyone and which is in
// the HTML before this renders.
export function SpotOverview({ rows }: { rows: number }) {
  const t = useTranslations("markets");
  const tOverview = useTranslations("overview");
  const { data: feed, isPending } = useDashboardFeed();

  if (isPending && !feed) return <PreviewRowSkeleton rows={rows} />;
  const markets = feed?.spot ?? null;
  if (markets === null) return <PreviewNotice>{t("marketsUnavailable")}</PreviewNotice>;
  const top = markets.slice(0, rows);
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
