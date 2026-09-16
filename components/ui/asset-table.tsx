"use client";

import { ListPagination } from "@/components/ui/list-pagination";
import { AssetTableRow, ASSET_COLUMNS, type AssetRowView } from "@/components/ui/asset-table-row";
import { ASSET_PAGE_SIZE } from "@/components/ui/desk-layout";

// How many pages a list of this length fills. Always at least one, so an empty
// list still reads as "Page 1 of 1" rather than "Page 1 of 0".
export function assetPageCount(total: number, pageSize = ASSET_PAGE_SIZE): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

// The slice of the full list that belongs on `page` (1-based). A desk's whole
// universe arrives in one response, so paging is a slice over what the caller
// already holds, not a second fetch.
//
// Generic in the row type, because the caller slices its own view models before
// mapping them into AssetRowView, and both desks page the same way.
export function assetPageRows<T>(rows: T[], page: number, pageSize = ASSET_PAGE_SIZE): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

// The user-facing copy the table draws. This component reads no message
// catalogue: a desk binds its own namespace and hands the finished strings
// over, the way SearchField takes its label.
export interface AssetTableLabels {
  // The grid's accessible name, announced before the rows.
  grid: string;
  asset: string;
  price: string;
  change24h: string;
  // The fourth column's header. Market cap on the spot desk, liquidity on the
  // real assets desk, which is why it is not named after either.
  metric: string;
  // Shown inside the rows block when the list is empty.
  noResults: string;
}

export interface AssetTableProps {
  // Display-ready rows for the current page only. This component fetches
  // nothing, formats nothing and slices nothing: whoever loads the markets
  // hands over finished strings, and assetPageRows cuts the page.
  rows: AssetRowView[];
  labels: AssetTableLabels;
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

// The market list on the left of a desktop trading desk: a header, one row per
// asset on the current page, and the shared pager pinned to the foot of the
// panel. The pager stays put when the list is empty, since an empty page is
// still a page you can leave, and hides itself when there is only one page.
//
// The panel fills the height of the cell it is placed in. The desk lays its two
// columns out as a stretching grid row, so the list reaches the bottom of the
// window instead of stopping under its last row and leaving the page background
// showing beneath the pager. `self-stretch` says that on the panel itself rather
// than relying on the parent alone, so the panel still fills whatever it is
// dropped into.
//
// The rows block clips what it cannot hold, which is a backstop and not a
// scroller: the caller reads that block through `rowsRef` and pages at the
// number of rows it holds, so there is normally nothing to clip. Nothing here
// scrolls in either direction, so a row is never hidden behind a scrollbar
// nobody can see.
export function AssetTable({
  rows,
  labels,
  page = 1,
  pageCount = 1,
  onPageChange,
  selectedId,
  onSelect,
  rowsRef,
  className = "",
}: AssetTableProps) {
  return (
    <div
      className={`bg-surface border-hairline rounded-card flex flex-col self-stretch overflow-hidden border ${className}`}
    >
      {/* The list takes the panel's spare height, which puts the pager at the
          very bottom. `min-h-0` at every step of the way down is what lets that
          height be the only thing the rows block has: without it a flex item
          refuses to shrink under its own content, and the block would grow with
          the rows it holds. */}
      <div className="flex min-h-0 grow flex-col">
        <div role="grid" aria-label={labels.grid} className="flex min-h-0 grow flex-col">
          <div
            role="row"
            className={`${ASSET_COLUMNS} border-rule shrink-0 border-b py-3.5 font-serif text-[10.5px] leading-[1.13] font-medium tracking-[0.04em] text-white/40`}
          >
            <span role="columnheader" className="uppercase">
              {labels.asset}
            </span>
            <span role="columnheader" className="text-right">
              {labels.price}
            </span>
            <span role="columnheader" className="text-right">
              {labels.change24h}
            </span>
            <span role="columnheader" className="text-right">
              {labels.metric}
            </span>
          </div>

          {/* The measured block, and the reason a fitted count cannot run away:
              `grow` gives it the panel's spare height, `min-h-0` with
              `overflow-hidden` means that height is all it ever has, so adding
              a row cannot make the box the count is read from any taller.

              "No results" sits in here rather than beside it, so it stays
              directly under the column labels where it is read instead of being
              pushed to the foot of a panel that now grows. */}
          <div ref={rowsRef} role="rowgroup" className="flex min-h-0 grow flex-col overflow-hidden">
            {rows.map((row) => (
              <AssetTableRow
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={onSelect}
              />
            ))}

            {rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] font-normal text-white/45">
                {labels.noResults}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* The pager the meme board, the markets list and the RWA list already
          use, so every paged list in the app pages the same way. It hides
          itself on a single page, and no height is reserved for it when it
          does: a list that fits on one page shows rows and then panel, with no
          empty bar standing in for a control that is not there. */}
      <ListPagination page={page} pages={pageCount} onPage={(next) => onPageChange?.(next)} />
    </div>
  );
}
