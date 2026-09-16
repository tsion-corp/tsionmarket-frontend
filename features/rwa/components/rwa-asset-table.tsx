"use client";

import { useTranslations } from "next-intl";
import { AssetTable } from "@/components/ui/asset-table";
import type { AssetRowView } from "@/components/ui/asset-table-row";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import { toRwaRowView } from "@/features/rwa/lib/row-view";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";

// The real assets desk's binding to the shared asset table. The table itself
// lives in components/ui because nothing about it is real assets: it takes
// finished rows and its copy as props. What belongs to this feature is the
// `rwa` namespace the labels come from, the logo lookup, and the yield pill,
// and that is all this file supplies.

export interface RwaAssetTableProps {
  // The assets on the current page only. The desk above slices the page, so
  // this component pages nothing and fetches no catalogue: the one request it
  // makes is for the logos of the rows it was handed.
  assets: RwaAssetView[];
  // 1-based page currently shown, and how many there are in total. The desk
  // owns both, so this table holds no state of its own.
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  // The asset open in the ticket beside the table, if any.
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  // Attached to the block the rows sit in. The panel is as tall as the window,
  // so how many rows fit is only knowable from this box, and the desk that
  // owns the page size is the one that needs to read it.
  rowsRef?: (node: HTMLDivElement | null) => void;
  className?: string;
}

export function RwaAssetTable({
  assets,
  page = 1,
  pageCount = 1,
  onPageChange,
  selectedId,
  onSelect,
  rowsRef,
  className = "",
}: RwaAssetTableProps) {
  const t = useTranslations("rwa");

  // One batched request for the page's logos. The registry's own logo URL is
  // the fallback inside toRwaRowView, so a row draws before the batch answers
  // and simply sharpens when it does.
  const logos = useTokenLogos(assets.map((a) => ({ chain: a.chain, address: a.address })));

  const rows: AssetRowView[] = assets.map((asset) => {
    const { apy, ...row } = toRwaRowView(asset, logos[tokenLogoKey(asset.chain, asset.address)]);
    return {
      ...row,
      // Only a handful of assets in the catalogue pay a yield, so APY rides
      // beside the ticker where it is real rather than taking a column that
      // would be empty for everything else. The shared row takes the mark as a
      // node, which is why the lib module hands over the string and the pill is
      // built here.
      badge: apy ? (
        <span className="border-up/25 bg-up/12 text-up shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold">
          {t("apyPill", { apy })}
        </span>
      ) : undefined,
    };
  });

  return (
    <AssetTable
      rows={rows}
      labels={{
        grid: t("eyebrow"),
        asset: t("asset"),
        price: t("price"),
        change24h: t("change24h"),
        // Liquidity, not market cap. Market cap is populated for almost no real
        // asset, so the column would be a dash on most rows; live DEX liquidity
        // is the figure this domain treats as real, and it is what the table
        // this desk replaces already carried.
        metric: t("liquidity"),
        noResults: t("noSearchMatches"),
      }}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      selectedId={selectedId}
      onSelect={onSelect}
      rowsRef={rowsRef}
      className={className}
    />
  );
}
