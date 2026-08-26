"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { assetPriceUsd, rwaLogoUrl } from "@/features/rwa/lib/api";
import { formatUsd } from "@/lib/trade/math";
import {
  assetLiquidityUsd,
  chainLabel,
  formatApy,
  formatChange,
  formatCompactUsd,
  gradientFor,
  isTradable,
  type RwaAssetView,
} from "@/features/rwa/lib/presenter";

interface RwaAssetRowProps {
  asset: RwaAssetView;
  selected: boolean;
  logo?: string;
  onOpen: () => void;
  onTrade: () => void;
}

function Dash() {
  return <span className="text-white/30">—</span>;
}

export function RwaAssetRow({ asset, selected, logo, onOpen, onTrade }: RwaAssetRowProps) {
  const t = useTranslations("rwa");
  const price = assetPriceUsd(asset);
  // Only three assets in the catalog pay a yield, so APY rides beside the name
  // where it is real rather than as a column that is empty for everything else.
  const apy = formatApy(asset.yieldApyBps);
  const change = formatChange(asset.market?.change24h);
  const up = (asset.market?.change24h ?? 0) >= 0;
  const tradable = isTradable(asset);

  return (
    <div
      onClick={onOpen}
      data-sensitive="position"
      className={`grid cursor-pointer grid-cols-[1.6fr_1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3.5 transition-colors first:border-t-0 hover:bg-white/4 min-[560px]:grid-cols-[1.7fr_0.8fr_1fr_auto] min-[820px]:grid-cols-[1.9fr_0.8fr_1fr_0.7fr_1fr_0.8fr] sm:px-6 ${
        selected ? "bg-accent/8" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AssetIcon
          sym={asset.symbol}
          bg={gradientFor(asset.symbol)}
          logo={logo ?? rwaLogoUrl(asset)}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-[14.5px] font-medium">{asset.name}</span>
            {apy ? (
              <span className="border-up/25 bg-up/12 text-up shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold">
                {t("apyPill", { apy })}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
            <span className="min-[560px]:hidden"> · {chainLabel(asset.chain)}</span>
          </div>
        </div>
      </div>

      <span className="hidden text-[13px] font-normal text-white/60 min-[560px]:block">
        {chainLabel(asset.chain)}
      </span>

      <span className="tnum text-right text-sm font-normal">
        {price != null ? formatUsd(price) : <Dash />}
      </span>

      <span className="tnum hidden text-right text-[13.5px] font-normal min-[820px]:block">
        {change ? <span className={up ? "text-up" : "text-down"}>{change}</span> : <Dash />}
      </span>

      <span className="tnum hidden text-right text-[13.5px] font-normal text-white/75 min-[820px]:block">
        {formatCompactUsd(assetLiquidityUsd(asset))}
      </span>

      <span className="text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrade();
          }}
          className={`cursor-pointer rounded-full border px-[15px] py-[7px] font-sans text-[12.5px] font-semibold whitespace-nowrap ${
            tradable
              ? "border-accent/30 bg-accent/14 text-accent hover:bg-accent/20"
              : "border-white/12 bg-white/5 text-white/70 hover:text-white"
          }`}
        >
          {tradable ? t("buy") : t("issuer")}
        </button>
      </span>
    </div>
  );
}
