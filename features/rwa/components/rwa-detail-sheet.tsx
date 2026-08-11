"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { PriceChart } from "@/components/ui/price-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useRwaPriceHistory } from "@/features/rwa/hooks/use-rwa-price-history";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { assetPriceUsd, rwaLogoUrl, type RwaApiAsset } from "@/features/rwa/lib/api";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import {
  assetLiquidityUsd,
  chainLabel,
  findRwaHolding,
  formatApy,
  formatChange,
  formatCompactUsd,
  gradientFor,
  isTradable,
  type RwaAssetView,
} from "@/features/rwa/lib/presenter";

interface RwaDetailSheetProps {
  asset: RwaAssetView;
  onTrade: (asset: RwaApiAsset, mode: "buy" | "sell") => void;
}

function Line({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span className={`tnum ${tone ?? "text-white"}`}>{v}</span>
    </div>
  );
}

export function RwaDetailSheet({ asset, onTrade }: RwaDetailSheetProps) {
  const t = useTranslations("rwa");
  const portfolio = usePortfolio();

  const logos = useTokenLogos([{ chain: asset.chain, address: asset.address }]);
  const logo = logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset);

  const price = assetPriceUsd(asset);
  const change = asset.market?.change24h;
  const up = (change ?? 0) >= 0;
  const apy = formatApy(asset.yieldApyBps);
  const liquidity = assetLiquidityUsd(asset);
  const tradable = isTradable(asset);

  const holding = findRwaHolding(portfolio.tokens, asset);
  const { points, loading } = useRwaPriceHistory(asset.chain, asset.address);

  return (
    <div>
      <Eyebrow>{t("assetDetails")}</Eyebrow>

      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={asset.symbol} bg={gradientFor(asset.symbol)} logo={logo} size={44} />
        <div className="min-w-0 flex-1">
          <div className="ws-display truncate text-[23px] tracking-[-0.01em]">{asset.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
          </div>
        </div>
        <div className="text-right">
          <div className="ws-display tnum text-[22px]">
            {price != null ? formatUsd(price) : "—"}
          </div>
          {formatChange(change) ? (
            <div className={`text-[13px] font-normal ${up ? "text-up" : "text-down"}`}>
              {formatChange(change)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="ws-inset grid h-[160px] place-items-center text-[13px] font-normal text-white/45">
            {t("loadingChart")}
          </div>
        ) : points.length > 1 ? (
          <PriceChart points={points} height={160} up={up} />
        ) : (
          <div className="ws-inset grid h-[160px] place-items-center text-[13px] font-normal text-white/45">
            {t("noChart")}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-[11px] text-[13.5px] font-normal text-white/60">
        {holding ? (
          <>
            <Line
              k={t("holdings")}
              v={`${formatAmount(holding.balance)} ${asset.symbol}`}
              tone="text-white"
            />
            <Line
              k={t("positionValue")}
              v={formatUsd(holding.balance * (price ?? holding.priceUsd))}
            />
          </>
        ) : null}
        <Line k={t("marketPrice")} v={price != null ? formatUsd(price) : "—"} />
        {apy ? <Line k={t("apy")} v={apy} tone="text-up" /> : null}
        <Line k={t("liquidity")} v={formatCompactUsd(liquidity)} />
        {asset.market?.marketCapUsd ? (
          <Line k={t("marketCap")} v={formatCompactUsd(asset.market.marketCapUsd)} />
        ) : null}
        <Line k={t("network")} v={chainLabel(asset.chain)} />
        <Line k={t("category")} v={asset.category} />
      </div>

      {asset.meta?.note ? (
        <p className="mt-3.5 text-[12.5px] leading-[1.5] font-normal text-white/45">
          {asset.meta.note}
        </p>
      ) : null}

      {tradable ? (
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            onClick={() => onTrade(asset, "buy")}
            className="text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
          >
            {holding
              ? t("buyMoreSymbol", { symbol: asset.symbol })
              : t("buySymbol", { symbol: asset.symbol })}
          </button>
          {holding ? (
            <button
              onClick={() => onTrade(asset, "sell")}
              className="w-full cursor-pointer rounded-[14px] border border-white/15 bg-white/5 p-3.5 font-sans text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t("sellSymbol", { symbol: asset.symbol })}
            </button>
          ) : null}
        </div>
      ) : asset.issuerUrl ? (
        <a
          href={asset.issuerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("openIssuer")}
          <ArrowUpRightIcon />
        </a>
      ) : null}
    </div>
  );
}
