"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";

const HREF = "/perps";

// The perps brief: the majors with their mark and what they can be levered to.
// The perp feed publishes no 24h change, so the row carries leverage instead of
// inventing a movement figure. Read from the dashboard feed; the server takes
// the gateway's mark where it has one and the app's own price where it does
// not, so a gateway that is down still gives a priced brief.
export function PerpsOverview({ rows }: { rows: number }) {
  const t = useTranslations("overview");
  const { data: feed, isPending } = useDashboardFeed();

  if (isPending && !feed) return <PreviewRowSkeleton rows={rows} />;
  const markets = (feed?.perps ?? []).slice(0, rows);
  if (markets.length === 0) return <PreviewNotice>{t("empty")}</PreviewNotice>;

  return (
    <>
      {markets.map((m) => (
        <PreviewRow
          key={m.symbol}
          href={HREF}
          sym={m.base}
          name={m.symbol}
          bg={tokenBg(m.base)}
          price={m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—"}
          note={t("leverage", { max: m.maxLeverage })}
        />
      ))}
    </>
  );
}
