"use client";

import { useTranslations } from "next-intl";
import { AssetTable, assetPageCount, assetPageRows } from "@/components/ui/asset-table";
import { ASSET_PAGE_SIZE, ASSET_ROW_HEIGHT } from "@/components/ui/desk-layout";
import {
  toSharedAssetRow,
  type SpotAssetRowView,
} from "@/features/trade/components/spot-asset-row";

// The spot desk's binding to the shared asset table. The table itself lives in
// components/ui because nothing about it is spot: it takes finished rows and
// its copy as props. What is spot is the `markets` namespace the labels come
// from and the market cap in the fourth column, and that is all this file
// supplies.

export type {
  SpotAssetRowView,
  SpotChangeDirection,
} from "@/features/trade/components/spot-asset-row";

// Kept under their old names because the desk and its tests read them from
// here. Both numbers now live in components/ui/desk-layout, so the spot desk
// and the real assets desk page and measure off the same values.
export const SPOT_ASSET_PAGE_SIZE = ASSET_PAGE_SIZE;
export const SPOT_ASSET_ROW_HEIGHT = ASSET_ROW_HEIGHT;

export function spotAssetPageCount(total: number, pageSize = SPOT_ASSET_PAGE_SIZE): number {
  return assetPageCount(total, pageSize);
}

export function spotAssetPageRows(
  rows: SpotAssetRowView[],
  page: number,
  pageSize = SPOT_ASSET_PAGE_SIZE
): SpotAssetRowView[] {
  return assetPageRows(rows, page, pageSize);
}

export interface SpotAssetTableProps {
  // Display-ready rows for the current page only. This component fetches
  // nothing, formats nothing and slices nothing: whoever loads the markets
  // hands over finished strings, and spotAssetPageRows cuts the page.
  rows: SpotAssetRowView[];
  // 1-based page currently shown, and how many there are in total. The caller
  // owns both, so this table holds no state of its own. A caller that shows
  // the whole list at once leaves all three out and gets no pager.
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  // The market currently open in the order ticket beside the table, if any.
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  // Attached to the block the rows sit in. The panel is as tall as the window,
  // so how many rows fit is only knowable from this box, and the caller that
  // owns the page size is the one that needs to read it.
  rowsRef?: (node: HTMLDivElement | null) => void;
  className?: string;
}

// The market list on the left of the desktop spot screen. Structure, geometry
// and behaviour are the shared table's; this adds the spot wording.
export function SpotAssetTable({
  rows,
  page = 1,
  pageCount = 1,
  onPageChange,
  selectedId,
  onSelect,
  rowsRef,
  className = "",
}: SpotAssetTableProps) {
  const t = useTranslations("markets");

  return (
    <AssetTable
      rows={rows.map(toSharedAssetRow)}
      labels={{
        grid: t("title"),
        asset: t("asset"),
        price: t("price"),
        change24h: t("change24h"),
        // The spot desk's fourth column is market cap.
        metric: t("mcap"),
        noResults: t("noResults"),
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
