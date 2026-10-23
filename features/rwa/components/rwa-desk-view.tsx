"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { AsyncEmpty, AsyncError } from "@/components/ui/async-state";
import { assetPageCount, assetPageRows } from "@/components/ui/asset-table";
import { ASSET_COLUMNS } from "@/components/ui/asset-table-row";
import {
  ASSET_PAGE_SIZE,
  ASSET_ROW_HEIGHT,
  DESK_CONTAINER,
  DESK_GRID,
  TICKET_PANEL,
  useSideBySideDesk,
} from "@/components/ui/desk-layout";
import { SearchField } from "@/components/ui/search-field";
import { RwaAssetTable } from "@/features/rwa/components/rwa-asset-table";
import { RwaTicket } from "@/features/rwa/components/rwa-ticket";
import { useListedRwaAssets } from "@/features/rwa/hooks/use-rwa-assets";
import { useRwaEnrichedAssets } from "@/features/rwa/hooks/use-rwa-prices";
import { dedupeByChain, type RwaAssetView } from "@/features/rwa/lib/presenter";
import { useFittedRowCount } from "@/hooks/use-fitted-row-count";

interface RwaDeskViewProps {
  // Raised rather than handled: adding funds opens the route's own modal host,
  // which the desk has no access to.
  onAddFunds?: () => void;
}

// Base first, the order the phone tab already lists these in: Base is where a
// buy is funded from, so the assets that need no bridge sit at the top.
//
// Sorted once over the whole catalogue rather than after each search. Sorting
// is stable, so filtering a sorted list leaves the same order as sorting a
// filtered one, and doing it here keeps the ordering identical whether or not
// anything has been typed.
function baseFirst(assets: RwaAssetView[]): RwaAssetView[] {
  return [...assets].sort((a, b) => Number(b.chain === "base") - Number(a.chain === "base"));
}

// The desktop Real assets desk: the asset list on the left, the order ticket on
// the right, one search field over both. The same geometry as the spot desk,
// down to the shared row height and page size, so a reader who has used one
// knows where everything is on the other.
//
// This is the composition layer, so it is the only file here that holds the
// desk's state: the children below it take finished strings and report events,
// and never fetch or format anything themselves.
//
// Phones keep the Market page's Real assets tab. The page picks between them.
export function RwaDeskView({ onAddFunds }: RwaDeskViewProps) {
  const t = useTranslations("rwa");
  const { assets, loading, error, refetch } = useListedRwaAssets();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);

  // What is listable is decided by the data layer, not here, so no screen can
  // widen it by accident. All that is left is collapsing an asset the registry
  // lists on more than one chain, then attaching the market stats the registry
  // itself serves for almost none of them.
  const tradable = useMemo(() => dedupeByChain(assets), [assets]);
  const priced = useRwaEnrichedAssets(tradable);
  const listed = useMemo(() => baseFirst(priced), [priced]);

  // Symbol, name, issuer and chain, the same four fields the phone tab
  // searches: an asset is as likely to be looked for by its issuer ("Ondo") or
  // its network as by its ticker.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return listed;
    return listed.filter((a) =>
      `${a.symbol} ${a.name} ${a.issuer} ${a.chain}`.toLowerCase().includes(needle)
    );
  }, [listed, query]);

  // A new search starts at the first page: the results are a different list, so
  // the page someone was on says nothing about where to open the new one.
  const [pagedQuery, setPagedQuery] = useState(query);
  if (query !== pagedQuery) {
    setPagedQuery(query);
    setRequestedPage(1);
  }

  // How many rows the list panel can hold at this window height. The table
  // hands back the block its rows sit in, whose height comes from the panel and
  // never from the rows themselves, so a bigger page cannot make the box the
  // count is read from any taller. Below xl nothing is measured and the design's
  // nine stand.
  //
  // The same row height and fallback the spot desk uses, from the same module,
  // so the two desks page identically at every window height.
  const { ref: rowsRef, rows: pageSize } = useFittedRowCount<HTMLDivElement>({
    rowHeight: ASSET_ROW_HEIGHT,
    fallbackRows: ASSET_PAGE_SIZE,
    enabled: useSideBySideDesk(),
  });

  // The table pages but holds no page, so the number, its bounds and the slice
  // all live here. The page is clamped rather than stored clamped, so a
  // catalogue that shrinks under someone parked on a later page lands them on
  // the last one instead of on an empty panel. A window that grows takes pages
  // away the same way, and the clamp is what carries that viewer back.
  const pageCount = assetPageCount(filtered.length, pageSize);
  const currentPage = Math.min(Math.max(1, requestedPage), pageCount);
  const pageAssets = useMemo(
    () => assetPageRows(filtered, currentPage, pageSize),
    [filtered, currentPage, pageSize]
  );

  // A search narrows the list, never the ticket: the asset someone is part way
  // through pricing stays open even once it scrolls out of the results.
  const selected = useMemo(() => {
    const chosen = selectedId ? listed.find((a) => a.id === selectedId) : undefined;
    return chosen ?? filtered[0] ?? listed[0] ?? null;
  }, [selectedId, listed, filtered]);

  return (
    <div className={DESK_CONTAINER}>
      <div className="flex grow flex-col gap-4">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          disabled={loading || error}
          className="max-w-[394px]"
        />

        {error ? (
          // The registry hook reports a failure as a boolean and keeps the
          // exception to itself, so there is no error object to hand over. The
          // panel then reads it as a plain failure and offers its own retry,
          // which is what a reader can act on; the connection bar still owns
          // the case where the whole backend is unreachable.
          <AsyncError
            error={null}
            subject="the real asset registry"
            unconfiguredDetail={t("registryUnavailable")}
            onRetry={() => void refetch()}
          />
        ) : loading ? (
          <DeskSkeleton label={t("loadingAssets")} rows={pageSize} rowsRef={rowsRef} />
        ) : listed.length === 0 ? (
          <AsyncEmpty>{t("noCategoryAssets")}</AsyncEmpty>
        ) : (
          // The two panels sit side by side only once the content column is
          // wide enough for the ticket's own width plus a readable list. Below
          // that they stack, which is also what the md..xl tablet range gets.
          <div className={DESK_GRID}>
            {/* The left column is the asset list alone. */}
            <RwaAssetTable
              assets={pageAssets}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setRequestedPage}
              rowsRef={rowsRef}
            />

            {/* The ticket opts out of the row's stretch on its own aside: the
                list is what fills the window, and a stretched ticket would
                leave a band of empty card under the block its foot is pinned
                to. No caret on the asset pill here, because the picker is the
                list already on screen beside it. */}
            <aside className={`${TICKET_PANEL} gap-[27px]`}>
              {selected ? <RwaTicket asset={selected} onAddFunds={onAddFunds} /> : null}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// One placeholder shape. The same fill the ticket skeleton uses, so the two
// columns read as one loading state rather than two.
const SKELETON_FILL = "animate-pulse rounded bg-white/6";

// The desk's shape while the registry is still in flight, drawn at the size the
// real thing will be so the page does not jump when the assets land.
//
// The left panel is built from the asset table's own box model rather than from
// a guessed row height: the same column track, the same paddings, the same
// rules, and a 33px chip in the asset cell. That chip is what sets a row's
// height, which is why copying it, and not a pixel figure, keeps the two in
// step when the table's type changes again.
//
// The row count is the same fitted count the real table pages at, and the same
// ref reads it: only one of the two panels is ever mounted, so one measurement
// serves both and the list does not change length when the assets land.
//
// The ticket opens on its price chart, so the ticket placeholder holds the
// chart's 200px too, the height the chart and its loading state both draw at.
function DeskSkeleton({
  label,
  rows,
  rowsRef,
}: {
  label: string;
  rows: number;
  rowsRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div role="status" aria-live="polite" className={DESK_GRID}>
      <span className="sr-only">{label}</span>
      <div className="border-hairline bg-surface rounded-card flex flex-col self-stretch overflow-hidden border">
        {/* The list region grows and the pager sits under it, which is how the
            real table distributes the panel's spare height. Copied rather than
            approximated with an `mt-auto` pager: the two land the pager in the
            same place today, but only the same structure keeps them together
            when the table's box changes again. The `min-h-0` chain down to the
            rows block is copied for the same reason, and here it also has to
            be: it is what keeps the measured box sized by the panel. */}
        <div className="flex min-h-0 grow flex-col">
          {/* The column labels. The font size and leading are set here so the
              `1lh` bars below stand exactly as tall as the real labels do. */}
          <div
            className={`${ASSET_COLUMNS} border-rule shrink-0 border-b py-3.5 text-[10.5px] leading-[1.13]`}
          >
            <span className={`${SKELETON_FILL} h-[1lh] w-[42px]`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[34px] justify-self-end`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[28px] justify-self-end`} />
            <span className={`${SKELETON_FILL} h-[1lh] w-[52px] justify-self-end`} />
          </div>

          <div ref={rowsRef} className="flex min-h-0 grow flex-col overflow-hidden">
            {Array.from({ length: rows }, (_, i) => (
              <div
                key={i}
                data-skeleton-row
                className={`${ASSET_COLUMNS} border-rule border-b py-3 last:border-b-0`}
              >
                <div className="flex items-center gap-3">
                  <span className={`${SKELETON_FILL} size-[33px] shrink-0 rounded-[11px]`} />
                  <span className={`${SKELETON_FILL} h-[11px] w-[84px]`} />
                </div>
                <span className={`${SKELETON_FILL} h-[11px] w-[62px] justify-self-end`} />
                <span className={`${SKELETON_FILL} h-[11px] w-[48px] justify-self-end`} />
                <span className={`${SKELETON_FILL} h-[11px] w-[56px] justify-self-end`} />
              </div>
            ))}
          </div>
        </div>

        {/* The pager at the foot of the panel: prev, the page count, next.
            Built from ListPagination's own box rather than from a pixel figure,
            the same way the rows above are built from the table's row.

            The height is reserved even though ListPagination hides itself on a
            single page, because at this point the catalogue has not arrived and
            the count is unknowable. The listed registry runs to about thirty
            assets after dedupe, which is three pages at the fitted count, so
            the common case settles with no movement at all. */}
        <div className="flex items-center justify-between border-t border-white/6 px-4 py-3 font-sans text-[12.5px] font-medium sm:px-6">
          <span
            className={`${SKELETON_FILL} inline-flex items-center rounded-full border border-transparent px-3.5 py-2`}
          >
            <span className="h-[1lh] w-[52px]" />
          </span>
          <span className={`${SKELETON_FILL} h-[1lh] w-[74px]`} />
          <span
            className={`${SKELETON_FILL} inline-flex items-center rounded-full border border-transparent px-3.5 py-2`}
          >
            <span className="h-[1lh] w-[52px]" />
          </span>
        </div>
      </div>
      <div className={`${TICKET_PANEL} gap-4`}>
        <div className="h-[40px] animate-pulse rounded-2xl bg-white/6" />
        <div className="rounded-card h-[200px] animate-pulse bg-white/6" />
        <div className="rounded-card h-[104px] animate-pulse bg-white/6" />
        <div className="rounded-card h-[92px] animate-pulse bg-white/6" />
        <div className="rounded-card mt-auto h-[76px] animate-pulse bg-white/6" />
        <div className="h-12 animate-pulse rounded-3xl bg-white/6" />
      </div>
    </div>
  );
}
