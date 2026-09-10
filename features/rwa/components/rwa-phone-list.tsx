"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ListPagination } from "@/components/ui/list-pagination";
import { useFitRows } from "@/hooks/use-fit-rows";
import { usePaged } from "@/hooks/use-paged";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { assetPriceUsd, rwaLogoUrl, type RwaApiAsset } from "@/features/rwa/lib/api";
import { formatChange, gradientFor, type RwaAssetView } from "@/features/rwa/lib/presenter";
import { formatUsd } from "@/lib/trade/math";

interface RwaPhoneListProps {
  assets: RwaAssetView[];
  loading: boolean;
  error: boolean;
  /** The Market page's search box, which this list filters itself by. */
  query: string;
  onOpen: (asset: RwaApiAsset) => void;
}

// The Real assets tab of the phone Market page: the same list the Memecoins
// tab draws, one row per asset, with the logo, the ticker and the issuer's
// name on the left and the price and the day's move on the right. A tap opens
// the asset's sheet, which carries Buy. Rows fill the phone: as many as the
// list's box holds, then the shared foot pager walks the rest.
export function RwaPhoneList({ assets, loading, error, query, onOpen }: RwaPhoneListProps) {
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inQuery = q
      ? assets.filter((a) =>
          `${a.symbol} ${a.name} ${a.issuer} ${a.chain}`.toLowerCase().includes(q)
        )
      : assets;
    // Base first, as the desk lists them: it is where a buy is funded from.
    return [...inQuery].sort((a, b) => Number(b.chain === "base") - Number(a.chain === "base"));
  }, [assets, query]);

  const listRef = useRef<HTMLDivElement>(null);
  const pageSize = useFitRows(listRef);
  const paged = usePaged(rows, pageSize);
  const logos = useTokenLogos(paged.pageItems.map((a) => ({ chain: a.chain, address: a.address })));

  let body: ReactNode;
  if (loading && assets.length === 0) {
    body = [0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex h-[60px] items-center gap-3 px-1">
        <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
        <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
      </div>
    ));
  } else if (error && assets.length === 0) {
    body = (
      <p className="mt-8 text-center text-[13px] font-normal text-white/45">
        {t("registryUnavailable")}
      </p>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="mt-8 text-center text-[13px] font-normal text-white/45">
        {query.trim() ? t("noSearchMatches") : t("noCategoryAssets")}
      </p>
    );
  } else {
    body = (
      <>
        {paged.pageItems.map((asset) => {
          const price = assetPriceUsd(asset);
          const change = formatChange(asset.market?.change24h);
          const up = (asset.market?.change24h ?? 0) >= 0;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onOpen(asset)}
              data-sensitive="position"
              className="flex h-[60px] w-full items-center gap-3 border-b border-white/6 px-1 text-left transition-colors active:bg-white/5"
            >
              <span className="shrink-0">
                <AssetIcon
                  sym={asset.symbol}
                  bg={gradientFor(asset.symbol)}
                  size={36}
                  logo={logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset)}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[14px] font-semibold text-white">
                  {asset.symbol}
                </span>
                <span className="block truncate text-[11.5px] font-normal text-white/50">
                  {asset.name}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block font-serif text-[13.5px] font-semibold text-white">
                  {price != null ? formatUsd(price) : "—"}
                </span>
                <span
                  className={`tnum block text-[12px] font-semibold ${
                    change ? (up ? "text-up" : "text-down") : "text-white/30"
                  }`}
                >
                  {change ?? "—"}
                </span>
              </span>
            </button>
          );
        })}
        <p aria-live="polite" className="sr-only">
          {tCommon("pageOf", { page: paged.page + 1, pages: paged.pageCount })}
        </p>
        <ListPagination
          page={paged.page + 1}
          pages={paged.pageCount}
          onPage={(target) => (target > paged.page + 1 ? paged.goNext() : paged.goPrev())}
        />
      </>
    );
  }

  return (
    <div
      ref={listRef}
      data-testid="rwa-market-list"
      className="-mx-1 mt-2 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
    >
      {body}
    </div>
  );
}
