"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { priceLabel } from "@/features/trade/components/meme-bits";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { tokenBg } from "@/lib/trade/assets";

const HREF = "/meme";

// The memecoin brief: what is trending right now, which is what the full
// section leads with too. Read from the dashboard feed.
export function MemeOverview({ rows }: { rows: number }) {
  const t = useTranslations("meme");
  const tOverview = useTranslations("overview");
  const { data: feed, isPending } = useDashboardFeed();

  if (isPending && !feed) return <PreviewRowSkeleton rows={rows} />;
  const tokens = feed?.memes ?? null;
  if (tokens === null) return <PreviewNotice>{t("unavailable")}</PreviewNotice>;
  const top = tokens.slice(0, rows);
  if (top.length === 0) return <PreviewNotice>{tOverview("empty")}</PreviewNotice>;

  return (
    <>
      {top.map((token) => {
        const sym = token.symbol ?? "?";
        return (
          <PreviewRow
            key={token.address}
            href={HREF}
            sym={sym}
            name={token.name ?? undefined}
            logo={token.logoUrl}
            bg={tokenBg(sym)}
            price={priceLabel(token.priceUsd)}
            change={token.change24h}
          />
        );
      })}
    </>
  );
}
