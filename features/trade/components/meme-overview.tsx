"use client";

import { useTranslations } from "next-intl";
import { PreviewNotice, PreviewRow, PreviewRowSkeleton } from "@/components/ui/preview-row";
import { priceLabel } from "@/features/trade/components/meme-bits";
import { useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import { tokenBg } from "@/lib/trade/assets";

const HREF = "/meme";

// The memecoin brief: what is trending right now, which is what the full
// section leads with too.
export function MemeOverview({ rows }: { rows: number }) {
  const t = useTranslations("meme");
  const tOverview = useTranslations("overview");
  const { tokens, isLoading, error } = useTrendingMemes();
  const top = tokens.slice(0, rows);

  if (isLoading) return <PreviewRowSkeleton rows={rows} />;
  if (error) return <PreviewNotice>{t("unavailable")}</PreviewNotice>;
  if (top.length === 0) return <PreviewNotice>{tOverview("empty")}</PreviewNotice>;

  return (
    <>
      {top.map((token) => {
        const sym = token.symbol ?? "?";
        const change = token.priceChange24hPercent;
        const changeNum = change == null ? null : Number(change);
        return (
          <PreviewRow
            key={token.address}
            href={HREF}
            sym={sym}
            name={token.name ?? undefined}
            logo={token.logoUrl}
            bg={tokenBg(sym)}
            price={priceLabel(token.priceUsd)}
            change={changeNum != null && Number.isFinite(changeNum) ? changeNum : null}
          />
        );
      })}
    </>
  );
}
