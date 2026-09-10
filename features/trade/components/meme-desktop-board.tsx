"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChartBarsIcon, ChevronLeftIcon, SearchIcon, TrendIcon } from "@/components/ui/icons";
import { ListPagination } from "@/components/ui/list-pagination";
import { MemeCoin, PctChange, priceLabel } from "@/features/trade/components/meme-bits";
import { useFittedRowCount } from "@/hooks/use-fitted-row-count";
import { compactUsd, type MemeToken } from "@/lib/meme/api";

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
// none of the disclosure state, so the caller decides when the chart and the
// metrics panels are mounted (and therefore when anything behind them polls).

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
  /** The chart, mounted under the rail header while `chartOpen`. */
  chart?: ReactNode;
  metricsOpen: boolean;
  onMetricsToggle: () => void;
  /** The market metrics panel, mounted while `metricsOpen`. */
  metrics?: ReactNode;
  /** The order ticket: quantity, quote breakdown and the buy or sell action. */
  ticket: ReactNode;
  /** The live transactions card, under the ticket. */
  activity?: ReactNode;
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
   * Called with the number of rows the list panel can hold, whenever that
   * changes, starting with MEME_LIST_PAGE_SIZE on the first render. The panel
   * is as tall as the window, so the size the caller should page at is only
   * knowable here. A caller that pages at anything else gets what it asked for
   * cut to what fits: this board never draws a row it has no room for.
   */
  onPageSizeChange?: (rows: number) => void;
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
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
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
  listFooter,
  page = 1,
  pageCount = 1,
  onPageChange,
  onPageSizeChange,
}: MemeDesktopBoardProps) {
  const t = useTranslations("meme");
  const tMarkets = useTranslations("markets");

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
  const rowsShowing = tokens.length > 0;
  const blocked = failed && !rowsShowing;

  // Cut to what the panel holds. The caller pages at the size this board last
  // reported, so the two normally agree; they disagree for the one render after
  // the window changes, and for a caller that never wired onPageSizeChange up.
  // Drawing the surplus in either case would push rows into the pagination bar
  // and past the bottom of the card.
  const rowsOnScreen = tokens.slice(0, fittedRows);

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
      <label className="border-hairline bg-surface flex h-[42px] w-[394px] items-center gap-[6px] rounded-full border px-[9px]">
        <SearchIcon size={13} />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label={t("searchAllLabel")}
          placeholder={tMarkets("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent font-sans text-[13px] font-normal text-white outline-none"
        />
      </label>

      {/* `items-start` keeps the rail hugging its own content while the list
          alone stretches, so an open chart lengthens the rail and a closed one
          does not leave it padded out to the list's height. */}
      <div data-region="desk-columns" className="flex grow items-start gap-[28px]">
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
            gain there. */}
        <section
          data-region="token-list"
          className="border-hairline bg-surface rounded-card flex min-h-[682px] min-w-0 flex-1 flex-col self-stretch overflow-hidden border"
        >
          <div
            className={`${COLUMNS} border-rule h-[41px] shrink-0 border-b font-serif text-[10.6px] font-medium tracking-[0.04em] text-white/40 uppercase`}
          >
            <span>{tMarkets("asset")}</span>
            <span className="text-right capitalize">{t("colPrice")}</span>
            <span className="text-right capitalize">{t("col24h")}</span>
            <span className="text-right capitalize">{t("colMcap")}</span>
          </div>

          {failed && rowsShowing ? (
            <div className="border-rule flex shrink-0 items-center justify-between gap-3 border-b px-[15px] py-2 font-sans text-[11px] text-white/45">
              <span>{t("unavailable")}</span>
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
                  <span>{t("unavailable")}</span>
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
                rowsOnScreen.map((token) => {
                  const picked =
                    selected?.address === token.address && selected?.chainId === token.chainId;
                  return (
                    <button
                      key={`${token.chainId}:${token.address}`}
                      type="button"
                      onClick={() => onSelect(token)}
                      aria-current={picked ? "true" : undefined}
                      className={`${COLUMNS} border-rule h-[57px] w-full shrink-0 cursor-pointer border-b text-left transition-colors ${
                        picked ? "bg-white/6" : "hover:bg-white/4"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-[11px]">
                        <MemeCoin token={token} size={33} />
                        <span className="flex min-w-0 flex-col gap-[2px]">
                          <span className="truncate font-serif text-[13.4px] font-medium text-white">
                            {token.symbol ?? "?"}
                          </span>
                          <span className="truncate font-sans text-[11px] font-normal text-white/50">
                            {token.name ?? "—"}
                          </span>
                        </span>
                      </span>
                      <span className="tnum truncate text-right font-sans text-[12.9px] font-semibold text-white">
                        {priceLabel(token.priceUsd)}
                      </span>
                      <span className="truncate text-right font-sans text-[12.5px] font-semibold">
                        <PctChange value={token.priceChange24hPercent} />
                      </span>
                      <span className="tnum truncate text-right font-serif text-[11px] font-medium text-white/50">
                        {compactUsd(token.marketCapUsd)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="grid flex-1 place-items-center px-4 text-center font-sans text-[13px] font-normal text-white/45">
                  {query.trim() ? t("noResults") : t("empty")}
                </div>
              )}
            </div>
          </div>

          {onPageChange ? (
            // ListPagination is the bar every paged list in the app already
            // draws, so the memecoin table and the spot table page identically.
            // It draws its own top rule and hides itself on a single page.
            // `mt-auto` is the second guarantee that it sits on the floor of
            // the panel: the rows block above already takes the spare height,
            // and this holds the bar down if a later state ever stops it.
            <div data-region="list-footer" className="mt-auto shrink-0">
              <ListPagination page={page} pages={pageCount} onPage={onPageChange} />
            </div>
          ) : listFooter ? (
            <div
              data-region="list-footer"
              className="border-rule text-grey-100 mt-auto shrink-0 border-t p-[13px] text-center font-serif text-[12px] font-medium"
            >
              {listFooter}
            </div>
          ) : null}
        </section>

        <section className="border-hairline bg-surface rounded-card w-[468px] shrink-0 border px-[18px] py-[15px]">
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

              <RailDisclosure
                icon={<TrendIcon size={11} />}
                label={chartOpen ? t("mobileCloseChart") : t("mobileViewChart")}
                open={chartOpen}
                onToggle={onChartToggle}
              />
              {chartOpen ? chart : null}

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

              <RailDisclosure
                icon={<ChartBarsIcon size={13} />}
                label={t("mobileMetrics")}
                open={metricsOpen}
                onToggle={onMetricsToggle}
              />
              {metricsOpen ? metrics : null}

              {ticket}
              {activity}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
