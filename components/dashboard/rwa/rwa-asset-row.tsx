"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { assetPriceUsd, assetTvlUsd, rwaLogoUrl, type RwaApiAsset } from "@/lib/rwa-api";
import { formatUsd } from "@/lib/trade/math";
import { formatApy, formatCompactUsd, gradientFor, isTradable } from "@/lib/rwa/presenter";

interface RwaAssetRowProps {
  asset: RwaApiAsset;
  selected: boolean;
  logo?: string;
  onOpen: () => void;
  onTrade: () => void;
}

function Dash() {
  return <span className="text-white/30">—</span>;
}

export function RwaAssetRow({ asset, selected, logo, onOpen, onTrade }: RwaAssetRowProps) {
  const price = assetPriceUsd(asset);
  const apy = formatApy(asset.yieldApyBps);
  const tradable = isTradable(asset);

  return (
    <div
      onClick={onOpen}
      className={`grid cursor-pointer grid-cols-[1.6fr_1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3.5 transition-colors first:border-t-0 hover:bg-white/4 min-[820px]:grid-cols-[2fr_1fr_0.8fr_1fr_0.8fr] sm:px-6 ${
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
          <div className="truncate font-sans text-[14.5px] font-medium">{asset.name}</div>
          <div className="truncate text-xs font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
          </div>
        </div>
      </div>

      <span className="tnum text-right text-sm font-normal">
        {price != null ? formatUsd(price) : <Dash />}
      </span>

      <span className="tnum hidden text-right text-[13.5px] font-normal min-[820px]:block">
        {apy ? <span className="text-up">{apy}</span> : <Dash />}
      </span>

      <span className="tnum hidden text-right text-[13.5px] font-normal text-white/75 min-[820px]:block">
        {formatCompactUsd(assetTvlUsd(asset))}
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
          {tradable ? "Buy" : "Issuer"}
        </button>
      </span>
    </div>
  );
}
