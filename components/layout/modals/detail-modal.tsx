"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { AssetChart } from "@/components/ui/asset-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DETAIL_LINE, Sparkline } from "@/components/ui/sparkline";
import { useCoingeckoId } from "@/hooks/use-coingecko-id";
import { coingeckoPlatform } from "@/lib/coingecko";
import { isUp } from "@/lib/format";
import type { DetailPayload } from "@/lib/modal-types";

export function DetailModal({ detail }: { detail: DetailPayload }) {
  const t = useTranslations("portfolio");

  // A known id charts directly. Otherwise, if the payload carries a chain and
  // contract, resolve the id from those, same as markets-view does for
  // long-tail spot markets. useCoingeckoId disables itself when either
  // argument is null, so a plain payload (neither field) never queries.
  const platform = detail.chartChain ? coingeckoPlatform(detail.chartChain) : null;
  const address = detail.chartAddress ?? null;
  const needsResolve = !detail.coingeckoId && Boolean(platform && address);
  const resolved = useCoingeckoId(needsResolve ? platform : null, needsResolve ? address : null);
  const chartId = detail.coingeckoId ?? resolved.id;

  return (
    <div>
      <Eyebrow>{t("assetDetails")}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={detail.sym} bg={detail.bg} size={44} logo={detail.logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[23px] tracking-[-0.01em]">{detail.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{detail.sub}</div>
        </div>
        <div className="text-right">
          <div className="ws-display tnum text-[22px]">{detail.price}</div>
          <div className={`text-[13px] font-normal ${isUp(detail.chg) ? "text-up" : "text-down"}`}>
            {detail.chg}
          </div>
        </div>
      </div>
      {chartId ? (
        <div className="mt-4">
          <AssetChart
            coingeckoId={chartId}
            up={detail.up ?? isUp(detail.chg)}
            {...(detail.candlesOnly
              ? { allowCandles: false, defaultType: "candles" as const }
              : {})}
          />
        </div>
      ) : needsResolve && resolved.loading ? (
        // Resolving the id from the contract. A blank pulse, not the
        // decorative sparkline, so we never flash a fake line before the real
        // chart lands.
        <div className="mt-4 h-[120px] animate-pulse rounded-[14px] bg-white/6" />
      ) : needsResolve ? (
        // Resolution finished and found nothing. Say so plainly rather than
        // drawing an invented line for data we don't have.
        <div className="mt-4 grid h-[120px] place-items-center rounded-[14px] bg-white/5 text-center text-[13px] font-normal text-white/45">
          {t("noChart")}
        </div>
      ) : (
        <div className="bg-[linear-gradient(180deg,rgba(255, 255, 255, 0.12),rgba(255, 255, 255, 0))] mt-4 rounded-[14px]">
          <Sparkline id="detail" line={DETAIL_LINE} height={120} viewHeight={120} />
        </div>
      )}
      <div className="mt-4 flex flex-col gap-[11px] text-[13.5px] font-normal text-white/60">
        {detail.stats.map((s) => (
          <div key={s.k} className="flex justify-between">
            <span>{s.k}</span>
            <span className="text-white">{s.v}</span>
          </div>
        ))}
      </div>
      {detail.cta && detail.onCta ? (
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            onClick={detail.onCta}
            className="ws-chrome text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
          >
            {detail.cta}
          </button>
          {detail.cta2 && detail.onCta2 ? (
            <button
              onClick={detail.onCta2}
              className="w-full cursor-pointer rounded-[14px] border border-white/15 bg-white/5 p-3.5 font-sans text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              {detail.cta2}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
