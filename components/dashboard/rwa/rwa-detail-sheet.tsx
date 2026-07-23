"use client";

import { useMemo } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { PriceChart } from "@/components/ui/price-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useRwaYieldHistory } from "@/hooks/use-rwa-yield-history";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { assetPriceUsd, assetTvlUsd, rwaLogoUrl, type RwaApiAsset } from "@/lib/rwa-api";
import { formatUsd } from "@/lib/trade/math";
import type { AreaPoint } from "@/hooks/use-chart";
import { formatApy, formatCompactUsd, gradientFor, isTradable } from "@/lib/rwa/presenter";

interface RwaDetailSheetProps {
  asset: RwaApiAsset;
  onTrade: (asset: RwaApiAsset) => void;
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="ws-inset flex flex-col gap-1 p-3">
      <span className="text-[11px] font-normal text-white/50">{k}</span>
      <span className="tnum font-sans text-[14px] font-semibold text-white/90">{v}</span>
    </div>
  );
}

export function RwaDetailSheet({ asset, onTrade }: RwaDetailSheetProps) {
  const yieldBearing = (asset.yieldApyBps ?? 0) > 0;
  const { points, loading, error } = useRwaYieldHistory(yieldBearing ? asset.id : null);

  // Yield history as ascending, de-duplicated area points. Date.parse is a pure
  // read of the point's timestamp, not the current time.
  const chartPoints = useMemo<AreaPoint[]>(() => {
    const byTime = new Map<number, number>();
    for (const p of points) {
      const value = p.apy ?? p.tvlUsd;
      if (value == null) continue;
      const time = Math.floor(Date.parse(p.timestamp) / 1000);
      if (!Number.isFinite(time)) continue;
      byTime.set(time, value);
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time, value }));
  }, [points]);

  const logos = useTokenLogos([{ chain: asset.chain, address: asset.address }]);
  const logo = logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset);

  const price = assetPriceUsd(asset);
  const apy = formatApy(asset.yieldApyBps);
  const tradable = isTradable(asset);
  const up =
    chartPoints.length < 2 || chartPoints[chartPoints.length - 1].value >= chartPoints[0].value;

  return (
    <div>
      <Eyebrow>{asset.category}</Eyebrow>

      <div className="mt-3 flex items-center gap-3">
        <AssetIcon sym={asset.symbol} bg={gradientFor(asset.symbol)} logo={logo} size={44} />
        <div className="min-w-0">
          <h3 className="truncate font-sans text-[18px] font-semibold">{asset.name}</h3>
          <div className="truncate text-[12.5px] font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
          </div>
        </div>
      </div>

      {asset.meta?.note ? (
        <p className="mt-3.5 text-[13px] font-normal text-white/60">{asset.meta.note}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat k="Price" v={price != null ? formatUsd(price) : "—"} />
        <Stat k="APY" v={apy ?? "—"} />
        <Stat k="TVL" v={formatCompactUsd(assetTvlUsd(asset))} />
        <Stat k="Network" v={asset.chain} />
      </div>

      {yieldBearing ? (
        <div className="mt-4">
          <div className="mb-2 text-[12px] font-medium tracking-[0.02em] text-white/50 uppercase">
            Yield history
          </div>
          {loading ? (
            <div className="ws-inset grid h-[200px] place-items-center text-[13px] font-normal text-white/45">
              Loading yield history…
            </div>
          ) : error || chartPoints.length === 0 ? (
            <div className="ws-inset grid h-[200px] place-items-center text-[13px] font-normal text-white/45">
              No yield history yet.
            </div>
          ) : (
            <PriceChart points={chartPoints} height={200} up={up} />
          )}
        </div>
      ) : null}

      {tradable ? (
        <button
          onClick={() => onTrade(asset)}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold hover:opacity-90"
        >
          Buy {asset.symbol}
        </button>
      ) : asset.issuerUrl ? (
        <a
          href={asset.issuerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold hover:opacity-90"
        >
          Open issuer
          <ArrowUpRightIcon />
        </a>
      ) : null}
    </div>
  );
}
