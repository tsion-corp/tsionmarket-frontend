"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowUpRightIcon, LockIcon } from "@/components/ui/icons";
import { assetPriceUsd, rwaLogoUrl, type RwaApiAsset } from "@/lib/rwa-api";
import { formatUsd } from "@/lib/trade/math";
import { formatApy, formatCompactUsd, gradientFor } from "@/lib/rwa/presenter";

interface RwaIssuerCardProps {
  asset: RwaApiAsset;
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-white/6 py-2.5 first:border-t-0">
      <span className="text-[12.5px] font-normal text-white/55">{k}</span>
      <span className="max-w-[60%] text-right text-[12.5px] font-medium text-white/85">{v}</span>
    </div>
  );
}

// Permissioned assets do not trade on a DEX. This card shows the issuer terms
// and links out instead of offering a buy that the build endpoint would reject.
export function RwaIssuerCard({ asset }: RwaIssuerCardProps) {
  const t = useTranslations("rwa");
  const price = assetPriceUsd(asset);
  const apy = formatApy(asset.yieldApyBps);
  const minInvest =
    asset.minInvestmentUsd != null && Number(asset.minInvestmentUsd) > 0
      ? formatUsd(Number(asset.minInvestmentUsd))
      : null;

  return (
    <div className="ws-card p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] sm:p-[22px]">
      <div className="flex items-center gap-3">
        <AssetIcon
          sym={asset.symbol}
          bg={gradientFor(asset.symbol)}
          logo={rwaLogoUrl(asset)}
          size={40}
        />
        <div className="min-w-0">
          <div className="truncate font-sans text-[15px] font-semibold">{asset.name}</div>
          <div className="truncate text-xs font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
          </div>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11.5px] font-medium text-white/65">
        <LockIcon />
        {t("issuerAccessOnly")}
      </div>

      <div className="ws-inset mt-3.5 p-[15px]">
        {price != null ? <Line k={t("price")} v={formatUsd(price)} /> : null}
        {apy ? <Line k={t("apy")} v={apy} /> : null}
        {asset.tvlUsd ? <Line k={t("tvl")} v={formatCompactUsd(asset.tvlUsd)} /> : null}
        <Line k={t("kycRequired")} v={asset.kycRequired ? t("yes") : t("no")} />
        {minInvest ? <Line k={t("minimumInvestment")} v={minInvest} /> : null}
        {asset.redemption ? <Line k={t("redemption")} v={asset.redemption} /> : null}
        {asset.meta?.note ? <Line k={t("notes")} v={asset.meta.note} /> : null}
      </div>

      {asset.issuerUrl ? (
        <a
          href={asset.issuerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold transition-opacity hover:opacity-90"
        >
          {t("openIssuer")}
          <ArrowUpRightIcon />
        </a>
      ) : (
        <p className="mt-4 text-center text-[12.5px] font-normal text-white/45">
          {t("contactIssuer")}
        </p>
      )}
    </div>
  );
}
