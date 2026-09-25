"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Disclosure } from "@/components/ui/disclosure";
import { ChartBarsIcon, ChevronLeftIcon, SearchIcon, TrendIcon } from "@/components/ui/icons";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { MemeCoin, PctChange, priceLabel } from "@/features/trade/components/meme-bits";
import {
  ChangeBar,
  formatMetric,
  timeframeLabelKey,
} from "@/features/trade/components/meme-gamified-bits";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { METRIC_KEYS } from "@/features/trade/components/meme-sort-menu";
import {
  ariaSortFor,
  columnFigure,
  memeColumns,
  metricColumnFor,
  nextSortFor,
} from "@/features/trade/components/meme-table-columns";
import { useFittedRowCount } from "@/hooks/use-fitted-row-count";
import type { MemeToken } from "@/lib/meme/api";
import { catalogKey } from "@/lib/meme/catalog";
import type { ScreenerMetric } from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";

// The 2.0 desktop memecoin board: the catalogue on the left, the coin being
// traded on the right.
//
// The four memecoin desktop frames in the design (main, market metrics, sell,
// opened charts) are one surface in four states, not four pages. The left
// column is identical in all four, the rail header is identical in all four,
// and the two disclosure rows literally flip their own labels between them
// ("View Chart" to "Close Chart", "View Market Metrics" to "Close Market
// Metrics"). The sell frame also draws the metrics open, so the axes compose:
// side, chart open, metrics open. This component is the shared surface plus the
// main state, and the other three states arrive through the `chart`, `metrics`
// and `ticket` slots.
//
// Presentational on purpose: it fetches nothing, holds no server state and owns
// none of the disclosure state. The caller still decides when the chart is
// mounted, and therefore when anything behind it polls; the metrics slot is
// mounted throughout, because the panel it is handed folds itself shut and
// something unmounted has nothing to fold. See the two slots' own notes.

export type MemeTradeSide = "BUY" | "SELL";

export interface MemeDesktopBoardProps {
  /** The catalogue, already fetched and filtered by the caller. */
  tokens: MemeToken[];
  /** The coin the rail is trading. Null renders the rail chrome only. */
  selected: MemeToken | null;
  onSelect: (token: MemeToken) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** True while the first page of the catalogue is still in flight. */
  isLoading?: boolean;
  /** True when the last catalogue request failed. */
  failed?: boolean;
  onRetry?: () => void;
  /** The rail's market label, e.g. "PEPE/SOL". Defaults to the coin's symbol. */
  pairLabel?: string;
  side: MemeTradeSide;
  onSideChange: (side: MemeTradeSide) => void;
  chartOpen: boolean;
  onChartToggle: () => void;
  /**
   * The chart, mounted under the rail header while `chartOpen` and unmounted
   * the moment it closes, so nothing behind it keeps running. The panel around
   * it animates either way.
   */
  chart?: ReactNode;
  metricsOpen: boolean;
  onMetricsToggle: () => void;
  /**
   * The market metrics panel. Unlike the chart this stays mounted, because the
   * panel folds itself shut (it is given the same `metricsOpen`) and a panel
   * that is unmounted cannot animate. So pass something presentational:
   * anything that polls, opens a socket or boots a chart belongs behind
   * `chart`, which this board does gate.
   */
  metrics?: ReactNode;
  /** The order ticket: quantity, quote breakdown and the buy or sell action. */
  ticket: ReactNode;
  /** The live transactions card, under the ticket. */
  activity?: ReactNode;
  /**
   * Controls that change what the list holds, drawn beside the search: the
   * route's Curated / All switch.
   */
  listControls?: ReactNode;
  /** The token list's footer action ("Manage tokens" in the design). */
  listFooter?: ReactNode;
  /** 1-based page the caller has sliced `tokens` to. */
  page?: number;
  /** How many pages the catalogue splits into at the size the caller pages at. */
  pageCount?: number;
  /**
   * Called with the 1-based page to move to. Passing it is what puts the
   * pagination bar in the list's footer, in place of `listFooter`.
   */
  onPageChange?: (page: number) => void;
  /**
   * The catalogue holds more than the caller has loaded. The bar keeps Next
   * open past `pageCount` and marks the count as not final; asking for the
   * page after the last is the caller's cue to fetch it.
   */
  pageMore?: boolean;
  /** The rows behind the last loaded page are on their way. */
  pageLoadingMore?: boolean;
  /**
   * Called with the number of rows the list panel can hold, whenever that
   * changes, starting with MEME_LIST_PAGE_SIZE on the first render. The panel
   * is as tall as the window, so the size the caller should page at is only
   * knowable here. A caller that pages at anything else gets what it asked for
   * cut to what fits: this board never draws a row it has no room for.
   */
  onPageSizeChange?: (rows: number) => void;
  /**
   * The Trending strip, drawn at the top of the left column. Passing it or
   * `screener` puts the list in that column under them; the rail is unchanged.
   */
  trending?: ReactNode;
  /** The screener toolbar, drawn between Trending and the list. */
  screener?: ReactNode;
  /** The window the change column reads. Defaults to 24h, today's column. */
  timeframe?: MemeTimeframe;
  /**
   * The applied sort's direction, for the heading's arrow. Ignored when
   * `sortMetric` is null.
   */
  sortOrder?: "asc" | "desc";
  /**
   * Sets the sort from a heading click. The screener owns the sort: this is the
   * same setter the sort menu calls, so a heading is a shortcut into one piece
   * of state rather than a second copy of it. Headings are plain text when this
   * is absent.
   */
  onSortChange?: (sort: { by: ScreenerMetric; order: "asc" | "desc" } | null) => void;
  /**
   * The applied sort. A metric the table does not already show gets a fifth
   * column, so the reader can see why the rows are in this order.
   */
  sortMetric?: ScreenerMetric | null;
  /** The clock the age column reads, for tests. Defaults to the wall clock. */
  now?: number;
  /** catalogKeys of the page's top gainers, each marked after its symbol. */
  topGainers?: Set<string>;
  /** Replaces the empty list's message, e.g. when filters matched nothing. */
  emptyText?: string;
  /** Replaces the unavailable message, e.g. when the filtered list failed. */
  unavailableText?: string;
}

// Rows per page of the catalogue before the panel has been measured.
//
// Paging is client-side, over the list the caller already holds: the route
// fetches the whole catalogue in one request and filters it locally, so cutting
// it into pages here costs no extra request and keeps the filter ahead of the
// cut. The route owns the page state, so it pages at this size until the board
// reports through `onPageSizeChange` how many rows the window actually holds.
//
// Ten is what the design's 682px frame holds, measured in Chrome: 41px of
// column header, 61.75px of pagination bar and the panel's two 1px borders
// leave 577.25px for rows, which is ten 57px rows and 7.25px over. An eleventh
// would need 627. It is also what the server renders and what the first client
// render hydrates with, before any element exists to measure, so it is the
// hook's fallback and must not be derived from anything.
export const MEME_LIST_PAGE_SIZE = 10;

// The outer height of one row, border included. Read off the rendered table in
// Chrome rather than taken from the design: every row's box measured 57.000 at
// 1440px wide, because `h-[57px]` plus `border-b` is 57 with Tailwind's
// border-box preflight, not 58.
//
// The fitted count divides the panel's spare height by this, so a value under
// the truth compounds and fits a row the panel would then have to clip.
export const MEME_LIST_ROW_HEIGHT = 57;

// The design's four columns: 15px of left padding, the asset column taking the
// slack, then price, 24h and market cap right-aligned against 26px of right
// padding.
//
// The three figure columns were 95/130/145. They are 51px narrower now, which
// is the 51px the rail gained, so the chart has room to breathe without the
// desk needing any more width than it did: the list's intrinsic minimum drops
// from 411px to 360px as the rail goes from 417px to 468px, leaving the whole
// desk's minimum at 856px. That matters because the route scrolls the desk
// horizontally below that, and widening the rail alone would have pushed the
// scrollbar in at wider screens. The figures still fit: "$0.00₄1234" in 88px,
// "-12.34%" in 110px, "$103.24B" in 121px.
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_88px_110px_121px] items-center pr-[26px] pl-[15px]";

// The same four with a 96px column for a sorted metric the table does not
// already show. Written out whole so Tailwind finds the class. The list's
// minimum width grows by the column, so the route's horizontal scroll starts
// 96px sooner while such a sort is applied.
const COLUMNS_WITH_METRIC =
  "grid grid-cols-[minmax(0,1fr)_88px_110px_121px_96px] items-center pr-[26px] pl-[15px]";

// One definition per column id. The table is built from these for its row model
// and its sorting state; every cell is still drawn by the grid below, so these
// carry no cell renderer.
const columnHelper = createColumnHelper<MemeToken>();
const TABLE_COLUMNS = [
  columnHelper.accessor((token) => token.symbol ?? "", { id: "asset" }),
  columnHelper.accessor((token) => token.priceUsd ?? "", { id: "price" }),
  columnHelper.accessor((token) => token.priceChange24hPercent ?? "", { id: "change" }),
  columnHelper.accessor((token) => token.marketCapUsd ?? "", { id: "marketCap" }),
];

const MINUTE_MS = 60_000;

function subscribeToMinute(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, MINUTE_MS);
  return () => clearInterval(id);
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

// Quantised to whole minutes, the unit the age column prints, so the snapshot
// is stable between reads within a render.
function readMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function readNothing(): number {
  return 0;
}

// The wall clock for the age column, read as an external store the way the
// live transactions card reads it. It only ticks while that column is showing.
// The server's snapshot is zero, which ageMinutes reads as unknown, so the
// first frame prints a dash rather than an age the client would disagree with.
function useMinuteClock(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribeToMinute : subscribeToNothing,
    enabled ? readMinute : readNothing,
    readNothing
  );
}

// The left column once Trending or the screener is passed: they stack above
// the list, and the 682px floor and the stretch move here from the list panel
// (ADR-2026-09-15-meme-trending-screener, section 1). No overflow is clipped,
// because the toolbar's Sort and Filters popovers hang down over the list.
// Without either slot the list panel is the column itself, as it always was.
function DeskLeftColumn({
  slotted,
  trending,
  screener,
  children,
}: {
  slotted: boolean;
  trending: ReactNode;
  screener: ReactNode;
  children: ReactNode;
}) {
  if (!slotted) return <>{children}</>;
  return (
    <div
      data-region="left-column"
      className="flex min-h-[682px] min-w-0 flex-1 flex-col gap-3 self-stretch"
    >
      {trending}
      {screener}
      {children}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  // The icon set ships a left chevron only; a quarter turn points it down, and
  // a further half turn points it up when the section is open.
  return (
    <ChevronLeftIcon
      size={11}
      className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
    />
  );
}

// One of the rail's two disclosure rows. The dot and the glyph carry the design's
// yellow, #FFD62F, which is --color-kash; the label and the chevron stay white
// and carry the open state.
function RailDisclosure({
  icon,
  label,
  open,
  onToggle,
  controls,
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  /** The panel this row opens, where the rail owns its id. */
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="flex cursor-pointer items-center gap-[8px] text-left text-white"
    >
      <span className="flex items-center gap-[4px]">
        <span aria-hidden className="bg-kash size-[3px] shrink-0 rounded-full" />
        <span aria-hidden className="text-kash">
          {icon}
        </span>
        <span className="font-serif text-[13px] font-semibold tracking-[-0.02em]">{label}</span>
      </span>
      <Chevron open={open} />
    </button>
  );
}

export function MemeDesktopBoard({
  tokens,
  selected,
  onSelect,
  query,
  onQueryChange,
  isLoading = false,
  failed = false,
  onRetry,
  pairLabel,
  side,
  onSideChange,
  chartOpen,
  onChartToggle,
  chart,
  metricsOpen,
  onMetricsToggle,
  metrics,
  ticket,
  activity,
  listControls,
  listFooter,
  page = 1,
  pageCount = 1,
  onPageChange,
  pageMore = false,
  pageLoadingMore = false,
  onPageSizeChange,
  trending,
  screener,
  timeframe = "24h",
  sortMetric = null,
  sortOrder = "desc",
  onSortChange,
  now,
  topGainers,
  emptyText,
  unavailableText,
}: MemeDesktopBoardProps) {
  const t = useTranslations("meme");
  const tMarkets = useTranslations("markets");
  const tScreener = useTranslations("memeScreener");
  const chartPanelId = `meme-desk-chart-${useId()}`;

  // How many rows the panel holds at this window height. The rows block carries
  // the ref, and its height comes from the panel alone: see the class list
  // below for why that is what makes the reading stable.
  const { ref: rowsRef, rows: fittedRows } = useFittedRowCount<HTMLDivElement>({
    rowHeight: MEME_LIST_ROW_HEIGHT,
    fallbackRows: MEME_LIST_PAGE_SIZE,
  });

  // Held in a ref so a caller passing an inline arrow does not turn every
  // render into a report. The count is what the caller cares about, not the
  // identity of its own handler.
  const reportPageSize = useRef(onPageSizeChange);
  useEffect(() => {
    reportPageSize.current = onPageSizeChange;
  });
  useEffect(() => {
    reportPageSize.current?.(fittedRows);
  }, [fittedRows]);

  // A failed refresh with rows already in hand is not an outage the user needs
  // protecting from: the catalogue is persisted precisely so real coins stay on
  // screen when the memecoin upstream drops, so the rows keep their place and
  // the strip above them says the prices are no longer fresh. Only a failure
  // with nothing to show takes over the list.
  // The row model, from the library the portfolio and spot tables already use.
  // Headless: it holds the sorting state and runs the search, and every row is
  // still drawn by the grid of buttons below (ADR-2026-09-16-meme-table-tanstack).
  //
  // manualSorting, because the rows arriving here are already ordered by
  // applyScreener, which compares exact decimal strings and puts unreadable
  // values last. TanStack's own comparators would read "3491589227" against
  // "25564" as text or push both through Number, which is the class of bug the
  // screener exists to avoid.
  const table = useReactTable({
    data: tokens,
    columns: TABLE_COLUMNS,
    // No filter of our own. The panel already has a search box above, and it
    // searches the whole catalogue through the backend rather than the rows in
    // hand, which is strictly better than anything this table could do locally.
    manualSorting: true,
    getRowId: (token) => `${token.chainId}:${token.address}`,
    getCoreRowModel: getCoreRowModel(),
  });
  // The table instance is stable; its row model changes with the data it was
  // given, which React Compiler cannot see, so the rows are read on every
  // render rather than memoised against a dependency it would report as unused.
  const visibleTokens = table.getRowModel().rows.map((row) => row.original);

  const rowsShowing = visibleTokens.length > 0;
  const blocked = failed && !rowsShowing;

  // Cut to what the panel holds. The caller pages at the size this board last
  // reported, so the two normally agree; they disagree for the one render after
  // the window changes, and for a caller that never wired onPageSizeChange up.
  // Drawing the surplus in either case would push rows into the pagination bar
  // and past the bottom of the card.
  const rowsOnScreen = visibleTokens.slice(0, fittedRows);

  const slotted = trending !== undefined || screener !== undefined;
  const metricColumn = metricColumnFor(sortMetric);
  // The one sort, as the column helpers read it.
  const appliedSort = sortMetric === null ? null : { by: sortMetric, order: sortOrder };
  const columns = metricColumn === null ? COLUMNS : COLUMNS_WITH_METRIC;
  const clock = useMinuteClock(now === undefined && metricColumn === "age");
  // Without the slots the heading stays the catalogue's own 24h label, word
  // for word; the screener's window labels take over once it is on the desk.
  const changeHeading =
    !slotted && timeframe === "24h" ? t("col24h") : tScreener(timeframeLabelKey(timeframe));
  const unavailable = unavailableText ?? t("unavailable");

  return (
    // `grow` here and on the columns row below is what carries the desk's
    // height down to the list panel's `self-stretch`. Both leave the basis at
    // `auto` rather than using `flex-1`, which would zero it: the ticket and an
    // open chart would then stop counting toward the height each box asks for,
    // and a window shorter than the desk would crop them instead of scrolling.
    // With an `auto` basis spare height is the only thing that is ever handed
    // down. The rows block inside the panel is the one box that does clamp its
    // own minimum, because it is the box being measured.
    <div data-region="meme-board" className="flex w-full grow flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="border-hairline bg-surface flex h-[42px] w-[394px] items-center gap-[6px] rounded-full border px-[9px]">
          <SearchIcon size={13} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label={t("searchAllLabel")}
            // The box searches the whole catalogue on more than a name, so it
            // says so. The spot market's "Search tokens" undersold it.
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent font-sans text-[13px] font-normal text-white outline-none"
          />
        </label>
        {listControls ? <div data-region="list-controls">{listControls}</div> : null}
      </div>

      {/* The two columns sit side by side from lg. Below that they stack: the
          rail alone is 468px and the table asks for about 360px, so on a tablet
          they cannot share a row without the page scrolling sideways. Stacked,
          the table takes the full width and the rail with its ticket follows it.
          From lg, `items-start` keeps the rail hugging its own content while
          the list alone stretches, so an open chart lengthens the rail and a
          closed one does not leave it padded out to the list's height. */}
      <div
        data-region="desk-columns"
        className="flex grow flex-col gap-4 lg:flex-row lg:items-start lg:gap-[28px]"
      >
        {/* The list panel is sized by whole rows. The design's 682px is a floor
            here, not a cap, and nothing inside it scrolls. A fixed 682px box
            with the rows scrolling inside it sliced a row in half: 641px of room
            is 11.2 rows of 57px, so the twelfth row was cut by the panel's edge.
            It could also push the pagination bar out of the frame whenever the
            stale-prices strip appeared. The panel now ends on a row boundary in
            every state, and the bar is always in view.

            `self-stretch` fills the column. The desk is as tall as the window
            now (the route sets that, and the two `grow` boxes above pass it
            down), so the card ends at the foot of the page instead of stopping
            short with black showing underneath. The rail still hugs its own
            content; only the list stretches. Same shape as the spot market list,
            which the two tables are meant to share.

            The 682px floor survives the stretch and does not fight it, because
            both are minimums and the taller one simply wins. Past a window of
            roughly 880px the stretch is already beyond 682 and the floor is
            inert. Below that, on a 768px laptop say, the floor is what holds the
            design's frame, so the card keeps its ten rows rather than shrinking
            to the window. And with no desk height at all, which is what the
            server renders until useIsMobile corrects on a phone, it is still the
            only thing holding the panel up: without it a two-result search
            collapses the card to the height of its two rows.

            Nothing crops, because the count gives way instead of the panel. The
            stale-prices strip is the case that used to push the panel past its
            floor: it takes 43.5px off the rows block, so on a 700px window the
            block measures 533.75px and the page is nine rows rather than ten.
            The bar stays in view and the ninth row stays whole.

            The page size follows that height rather than staying at the ten the
            comp was drawn at. In a 1200px window the rows block measures
            894.25px, and ten rows fill 570 of it: the other 324px was empty
            card between the last row and the pager, which is what it reads as
            on screen, a black band above the bar. Fifteen rows fit, and fifteen
            is what the board now asks the caller to page at.
            The board measures the rows block and reports the count through
            `onPageSizeChange`, and the route pages at what it is told.

            The cost is that opening the chart or the metrics disclosure in the
            rail can repaginate the list, because the rail is what the panel
            stretches to once it is taller than the window. Rows move under the
            reader and "Page 2 of 5" changes meaning. The empty band was the
            louder defect of the two, and the pager is still honest about where
            the reader is; the spot list holds its nine because its panel is the
            taller of the two columns to begin with, so there was nothing to
            gain there.

            With Trending and the screener on the desk, the floor and the
            stretch move to the left column around them, and the panel takes
            what they leave with `flex-1 min-h-0`. The rows block is still the
            box that is measured, so the same fitting holds with fewer rows. */}
        <DeskLeftColumn slotted={slotted} trending={trending} screener={screener}>
          <section
            data-region="token-list"
            className={
              slotted
                ? "border-hairline bg-surface rounded-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border"
                : "border-hairline bg-surface rounded-card flex min-h-[682px] min-w-0 flex-1 flex-col self-stretch overflow-hidden border"
            }
          >
            <div
              role="row"
              data-region="token-header"
              className={`${columns} border-rule h-[41px] shrink-0 border-b font-serif text-[10.6px] font-medium tracking-[0.04em] text-white/40 uppercase`}
            >
              {memeColumns(metricColumn).map((column) => {
                const label =
                  column.id === "asset"
                    ? tMarkets("asset")
                    : column.id === "price"
                      ? t("colPrice")
                      : column.id === "change"
                        ? changeHeading
                        : column.id === "marketCap"
                          ? t("colMcap")
                          : tScreener(METRIC_KEYS[metricColumn as ScreenerMetric]);
                const align = column.numeric ? "text-right" : "";
                const caps = column.id === "asset" ? "" : "capitalize";
                const truncate = column.id === "metric" ? "truncate" : "";
                // A column with nothing to sort stays a plain cell rather than
                // a button that looks pressable and does nothing.
                if (column.sortsBy === null || onSortChange === undefined) {
                  return (
                    <span key={column.id} className={`${truncate} ${align} ${caps}`.trim()}>
                      {label}
                    </span>
                  );
                }
                const sorted = sortMetric === column.sortsBy;
                return (
                  <span
                    key={column.id}
                    aria-sort={ariaSortFor(column, appliedSort)}
                    className={`${truncate} ${align} ${caps}`.trim()}
                  >
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSortFor(column, appliedSort))}
                      className={`cursor-pointer rounded-[4px] uppercase transition-colors hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:outline-none ${
                        sorted ? "text-white/80" : ""
                      }`}
                    >
                      {label}
                      <span aria-hidden className="ml-[3px] inline-block w-[7px] text-[8px]">
                        {sorted ? (sortOrder === "asc" ? "\u25B2" : "\u25BC") : ""}
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>

            {failed && rowsShowing ? (
              <div className="border-rule flex shrink-0 items-center justify-between gap-3 border-b px-[15px] py-2 font-sans text-[11px] text-white/45">
                <span>{unavailable}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
                  >
                    {t("retry")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* The measured box, and the reason the count cannot run away: it is
              empty in flow. The rows are laid out in the absolutely positioned
              layer inside it, which contributes nothing to anyone's height, so
              this box is left with `flex-1` against a header and a pager of
              fixed height and takes exactly the panel's spare space. Adding a
              row cannot make the box the count is read from any taller.

              Nothing weaker holds. `grow` alone leaves the flex basis at the
              rows' own height. `flex-1` zeroes the basis, but every box above
              this one up to the route is a min-height, so the panel's height is
              still indefinite, and a basis-zero item in an indefinite column is
              sized by its content all the same: measured in Chrome, a window
              dragged from 1200px down to 700px kept fifteen rows and left the
              panel 959px tall inside a 700px window. In the layer the rows
              cannot prop anything open, and the same drag settles at 682px and
              ten rows.

              `overflow-hidden` is the backstop, not the mechanism. The count is
              floored and the list is cut to it, so the rows drawn always fit the
              height they were counted from and there is nothing to clip. */}
            <div
              ref={rowsRef}
              data-region="token-rows"
              className="relative min-h-0 flex-1 overflow-hidden"
            >
              <div data-region="token-rows-layer" className="absolute inset-0 flex flex-col">
                {isLoading ? (
                  <div role="status" aria-label={t("loading")} className="shrink-0">
                    {Array.from({ length: fittedRows }, (_, i) => (
                      <div key={i} className="border-rule h-[57px] border-b px-[15px] py-[12px]">
                        <div className="h-full w-full animate-pulse rounded-[10px] bg-white/6" />
                      </div>
                    ))}
                  </div>
                ) : blocked ? (
                  <div className="grid flex-1 place-items-center gap-3 px-4 text-center font-sans text-[13px] font-normal text-white/45">
                    <span>{unavailable}</span>
                    {onRetry ? (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 font-sans text-[12.5px] font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
                      >
                        {t("retry")}
                      </button>
                    ) : null}
                  </div>
                ) : rowsShowing ? (
                  rowsOnScreen.map((token: MemeToken) => {
                    const picked =
                      selected?.address === token.address && selected?.chainId === token.chainId;
                    const gainer = topGainers?.has(catalogKey(token)) ?? false;
                    const symbol = (
                      <span className="truncate font-serif text-[13.4px] font-medium text-white">
                        {token.symbol ?? "?"}
                      </span>
                    );
                    return (
                      <button
                        key={`${token.chainId}:${token.address}`}
                        type="button"
                        onClick={() => onSelect(token)}
                        aria-current={picked ? "true" : undefined}
                        className={`${columns} border-rule h-[57px] w-full shrink-0 cursor-pointer border-b text-left transition-colors ${
                          picked ? "bg-white/6" : "hover:bg-white/4"
                        }`}
                      >
                        {/* One cell per column, from the same description the
                            header row reads, and every figure from
                            columnFigure. A column cannot be headed by one
                            metric and drawn from another, and the money and
                            count cells compact through lib/meme/format like
                            the Trending cards do. */}
                        {memeColumns(metricColumn).map((column) => {
                          const figure = columnFigure(column, token, timeframe, now ?? clock);
                          switch (figure.kind) {
                            case "identity":
                              return (
                                <span
                                  key={column.id}
                                  className="flex min-w-0 items-center gap-[11px]"
                                >
                                  <MemeCoin token={token} size={33} />
                                  <span className="flex min-w-0 flex-col gap-[2px]">
                                    {gainer ? (
                                      <span className="flex min-w-0 items-center gap-[4px]">
                                        {symbol}
                                        <span
                                          role="img"
                                          aria-label={tScreener("topGainer")}
                                          className="shrink-0 text-[11px] leading-none"
                                        >
                                          🔥
                                        </span>
                                      </span>
                                    ) : (
                                      symbol
                                    )}
                                    <span className="truncate font-sans text-[11px] font-normal text-white/50">
                                      {token.name ?? "—"}
                                    </span>
                                  </span>
                                </span>
                              );
                            case "price":
                              return (
                                <span
                                  key={column.id}
                                  className="tnum truncate text-right font-sans text-[12.9px] font-semibold text-white"
                                >
                                  {priceLabel(figure.value)}
                                </span>
                              );
                            case "percent":
                              return slotted ? (
                                // The bar's 2px box is kept when there is no
                                // change to draw, so a dash sits level with the
                                // figures beside it.
                                <span
                                  key={column.id}
                                  className="flex min-w-0 flex-col items-end gap-[4px] text-right font-sans text-[12.5px] font-semibold"
                                >
                                  <span className="max-w-full truncate">
                                    <PctChange value={figure.value} />
                                  </span>
                                  <span className="block h-[2px] w-full max-w-[56px]">
                                    <ChangeBar change={figure.value} />
                                  </span>
                                </span>
                              ) : (
                                <span
                                  key={column.id}
                                  className="truncate text-right font-sans text-[12.5px] font-semibold"
                                >
                                  <PctChange value={figure.value} />
                                </span>
                              );
                            default:
                              return (
                                <span
                                  key={column.id}
                                  className="tnum truncate text-right font-serif text-[11px] font-medium text-white/50"
                                >
                                  {formatMetric(figure, tScreener)}
                                </span>
                              );
                          }
                        })}
                      </button>
                    );
                  })
                ) : (
                  <div className="grid flex-1 place-items-center px-4 text-center font-sans text-[13px] font-normal text-white/45">
                    {query.trim() ? t("noResults") : (emptyText ?? t("empty"))}
                  </div>
                )}
              </div>
            </div>

            {onPageChange ? (
              // The catalogue runs to thousands of coins, so the bar numbers its
              // pages rather than saying "Page 2 of 3" beside a Load more: the
              // reader sees how far the list goes, and the route loads the pages
              // ahead as they are reached. Its Prev and Next are ListPagination's
              // own, so the bar is the height the row-fitting measurement above
              // assumes. It draws its own top rule and hides itself on a single
              // page with nothing more to load.
              // `mt-auto` is the second guarantee that it sits on the floor of
              // the panel: the rows block above already takes the spare height,
              // and this holds the bar down if a later state ever stops it.
              <div data-region="list-footer" className="mt-auto shrink-0">
                <NumberedPagination
                  page={page}
                  pages={pageCount}
                  onPage={onPageChange}
                  more={pageMore}
                  loadingMore={pageLoadingMore}
                />
              </div>
            ) : listFooter ? (
              <div data-region="list-footer" className="mt-auto shrink-0">
                <div className="border-rule text-grey-100 border-t p-[13px] text-center font-serif text-[12px] font-medium">
                  {listFooter}
                </div>
              </div>
            ) : null}
          </section>
        </DeskLeftColumn>

        <section className="border-hairline bg-surface rounded-card w-full border px-[18px] py-[15px] lg:w-[468px] lg:shrink-0">
          {selected ? (
            <div className="flex flex-col gap-[13px]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-[13px]">
                  {/* The design draws a chevron here for switching market. On
                    desktop the catalogue sits beside the rail and is the
                    picker, so the affordance would promise a menu that does
                    not exist. */}
                  <span className="border-hairline bg-surface flex h-[38px] shrink-0 items-center gap-[5px] rounded-2xl border px-[10px]">
                    <MemeCoin token={selected} size={17} />
                    <span className="text-grey-100 font-serif text-[14px] font-semibold tracking-[-0.03em]">
                      {pairLabel ?? selected.symbol ?? "?"}
                    </span>
                  </span>
                  <span className="font-serif text-[14px] font-semibold tracking-[-0.03em]">
                    <PctChange value={selected.priceChange24hPercent} />
                  </span>
                </div>
                <span className="tnum font-serif text-[19px] font-extrabold text-white">
                  {priceLabel(selected.priceUsd)}
                </span>
              </div>

              {/* Row and panel in one gapless box. The panel keeps its place in
                  the rail while it is shut so it can fold rather than vanish,
                  and the rail's 13px lead rides on the panel's content, where
                  the clip cuts it away with everything else. On the column it
                  would leave 13px of empty rail under a closed row, and on the
                  Disclosure's className it would sit on the grid item and hold
                  the shut panel 13px tall. */}
              <div className="flex flex-col">
                <RailDisclosure
                  icon={<TrendIcon size={11} />}
                  label={chartOpen ? t("mobileCloseChart") : t("mobileViewChart")}
                  open={chartOpen}
                  onToggle={onChartToggle}
                  controls={chartPanelId}
                />
                <Disclosure open={chartOpen} id={chartPanelId}>
                  {chartOpen ? <div className="pt-[13px]">{chart}</div> : null}
                </Disclosure>
              </div>

              <div className="bg-grey-800 flex gap-[8px] rounded-full p-[8px]">
                {(["BUY", "SELL"] as const).map((option) => {
                  const on = side === option;
                  const selectedFill = option === "BUY" ? "bg-buy" : "bg-sell";
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onSideChange(option)}
                      aria-pressed={on}
                      className={`flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-full font-sans text-[17px] font-semibold transition-colors ${
                        on
                          ? `${selectedFill} text-white`
                          : // Neither the fill nor the ink here maps to a token:
                            // the design uses a near-black wash and a minted
                            // white for the resting half of the switcher.
                            "border border-white/8 bg-[rgba(54,54,54,0.16)] text-[#e9fff7]"
                      }`}
                    >
                      {option === "BUY" ? t("buy") : t("sell")}
                    </button>
                  );
                })}
              </div>

              {/* The metrics slot is not gated. It is handed a panel that draws
                  figures the caller already holds and that reads the same
                  `metricsOpen` to fold itself, so mounting it costs nothing and
                  unmounting it is what used to make the rail snap. Gapless for
                  the same reason as the chart row: the panel's lead is its own. */}
              <div className="flex flex-col">
                <RailDisclosure
                  icon={<ChartBarsIcon size={13} />}
                  label={t("mobileMetrics")}
                  open={metricsOpen}
                  onToggle={onMetricsToggle}
                />
                {metrics}
              </div>

              {ticket}
              {activity}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
