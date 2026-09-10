"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCoingeckoId } from "@/hooks/use-coingecko-id";
import { type MemeToken } from "@/lib/meme/api";
import { chainSlug } from "@/lib/meme/chain";

// The chart's drawing area on a phone. The design gives the disclosure the
// width of the screen and about a third of its height.
const CHART_DRAW_HEIGHT = 150;
const CHART_AREA_HEIGHT = 212;

// The chart pulls lightweight-charts (~168KB) and the panel starts collapsed,
// so the bundle only arrives once someone opens "View Chart".
const AssetChart = dynamic(() => import("@/components/ui/asset-chart").then((m) => m.AssetChart), {
  ssr: false,
});

// The coin's chart, mounted only while the disclosure is open, so a collapsed
// chart resolves no id and subscribes to no series.
//
// Two of its states belong to the id lookup and are drawn here: the lookup in
// flight, and a coin CoinGecko does not list. Everything past the id is
// AssetChart's own.
export function BoardChart({ token }: { token: MemeToken }) {
  const t = useTranslations("meme");
  const { id, loading } = useCoingeckoId(chainSlug(token.chainId), token.address);
  const up = Number(token.priceChange24hPercent ?? "0") >= 0;

  return (
    <div data-region="meme-chart" className="border-hairline rounded-card bg-surface border">
      {loading ? (
        <div role="status" aria-live="polite" style={{ height: CHART_AREA_HEIGHT }}>
          <span className="sr-only">{t("loading")}</span>
          <div aria-hidden="true" className="size-full animate-pulse rounded-[14px] bg-white/6" />
        </div>
      ) : id ? (
        <AssetChart coingeckoId={id} up={up} height={CHART_DRAW_HEIGHT} allowCandles={false} />
      ) : (
        <div
          style={{ height: CHART_AREA_HEIGHT }}
          className="grid place-items-center px-5 text-center text-[13px] font-normal text-white/45"
        >
          {t("noChart")}
        </div>
      )}
    </div>
  );
}
