"use client";

import { useId, useState, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, FlameIcon, RefreshIcon } from "@/components/ui/icons";
import {
  MemeTrendingCard,
  MemeTrendingCardSkeleton,
  TRENDING_MIN_CARD_PX,
  type TrendingVariant,
} from "@/features/trade/components/meme-trending-card";
import { timeframeLabelKey } from "@/features/trade/components/meme-gamified-bits";
import { catalogKey } from "@/lib/meme/catalog";
import type { MemeTimeframe, MemeToken } from "@/lib/meme/types";

// The Trending strip above the screener: the hottest coins in the window,
// ranked, a page at a time (ADR-2026-09-15-meme-trending-screener, section 3).
// Presentational: the controller hook owns the query, the page and the heat.

// Three a page. Trending is a shortlist of what is moving, and three cards sit
// across a desk's left column at a readable width instead of being squeezed or
// wrapped to a second row on all but the widest windows.
export const TRENDING_DESK_PAGE_SIZE = 3;
// Three on a phone as well, so both surfaces rank the same coins on a page and
// a reader moving between them sees the same shortlist. A side-scroller held
// five but cut the card at the screen's edge, and a card sliced down the middle
// reads as broken rather than as an invitation to swipe.
export const TRENDING_PHONE_PAGE_SIZE = 3;

// The container width that fits a page across in one row: three cards at their
// 156px floor with two 8px gaps between them. Under it the grid drops to two
// columns and lays the third card across the foot.
export const TRENDING_ROW_MIN_PX = TRENDING_MIN_CARD_PX * 3 + 8 * 2;

export { TRENDING_MIN_CARD_PX };

// The desk strip's height with its cards in one row, and its floor in every
// state. The token list under it fits whole rows into what the left column has
// left, so a strip that changed height between loading, error and data would
// repaginate the table under the reader. 20px of padding, a 28px header, an 8px
// gap, and 114px for cards that need 107px (a 28px coin line, the 18px change,
// the 14px what-if line, the 7px heat bar, three 6px gaps and the card's own
// padding and border). A column too narrow for three cards wraps them onto a
// second row and the strip grows with them, which is a change in width, not a
// change in state, so the table is not repaginated under anyone.
export const TRENDING_DESK_HEIGHT = 172;

// One card a cell, on both surfaces, and never a row with a hole in it. A page
// is three cards, so the arrangement is only ever one of three:
//   484px and up: three across, one row.
//   320px to 484px: two across, the third laid across the foot. This is a
//     phone, and the desk's left column at around 1024px.
//   under 320px: one card a row, because two at 156px no longer fit.
// The queries read the box the cards sit in, not the window, because the desk's
// left column and a phone's list are different widths at the same viewport.
// Written out, not built from TRENDING_MIN_CARD_PX: Tailwind reads class names
// out of the source as plain text, so a class assembled at runtime is never
// generated. A test keeps the two in step.
const TRENDING_GRID =
  "grid auto-rows-fr grid-cols-1 gap-2 @min-[320px]:grid-cols-2 @min-[484px]:grid-cols-3 @min-[320px]:@max-[484px]:[&>*:nth-child(3)]:col-span-2";

// A phone card's height, held in a variable so a skeleton stands exactly as
// tall as the card it stands in for and the list below does not jump when
// trending lands. The desk's cards take their height from the strip instead.
const PHONE_CARD_HEIGHT = "107px";

const PAGE_SIZE: Record<TrendingVariant, number> = {
  desk: TRENDING_DESK_PAGE_SIZE,
  phone: TRENDING_PHONE_PAGE_SIZE,
};

// The header's round icon buttons, one step smaller than the table's, so the
// strip's pager cannot be mistaken for the table's numbered one. Refresh sits
// beside the pager and shares the shape: the header speaks one control
// language. Colour and cursor are left to each state below rather than set
// here, because two utilities for the same property in one class list are
// settled by the stylesheet's order, not by the order they are written in.
const ICON_BUTTON =
  "grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-white/5 transition-colors";

const ICON_BUTTON_IDLE = "cursor-pointer text-white/60 hover:bg-white/10 hover:text-white";

const PAGER_BUTTON = `${ICON_BUTTON} ${ICON_BUTTON_IDLE} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/60`;

// Refresh in flight. Disabled but not faded: a greyed-out control reads as "not
// available", and what the reader needs to see is "working".
const REFRESH_BUSY = "cursor-wait text-white";

// The board's retry pill.
const RETRY_PILL =
  "cursor-pointer rounded-full border border-white/15 px-4 py-1.5 font-sans text-[12.5px] font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white";

export interface MemeTrendingStripProps {
  variant: TrendingVariant;
  /** The current page's coins, already cut to the page. */
  tokens: MemeToken[];
  /** (page - 1) * page size, so ranks run on across pages. */
  rankOffset: number;
  /** heatShares over every trending coin, not just this page, keyed by catalogKey. */
  heat: Map<string, number | null>;
  timeframe: MemeTimeframe;
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  /** Trending is narrowed by the screener's bounds. */
  filtered: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  selectedKey: string | null;
  onSelect: (token: MemeToken) => void;
  /**
   * Reloads the page. Injected so a test can watch it: jsdom refuses to let
   * `window.location.reload` be replaced, so a strip that called it inline
   * would have an untestable control. Defaults to `reloadPage`.
   */
  reload?: () => void;
}

/**
 * The refresh control's default action.
 *
 * `target` exists only so this can be proved without navigating jsdom; nothing
 * in the app passes it.
 */
export function reloadPage(target: Pick<Location, "reload"> = window.location) {
  target.reload();
}

function TrendingPager({
  page,
  pages,
  onPageChange,
}: Pick<MemeTrendingStripProps, "page" | "pages" | "onPageChange">) {
  const t = useTranslations("memeScreener");
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t("trendingPrev")}
        className={PAGER_BUTTON}
      >
        <ChevronLeftIcon size={14} />
      </button>
      <span className="tnum min-w-[38px] text-center font-sans text-[11px] font-medium text-white/45">
        {t("trendingPageOf", { page, pages })}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
        aria-label={t("trendingNext")}
        className={PAGER_BUTTON}
      >
        <ChevronLeftIcon size={14} className="rotate-180" />
      </button>
    </div>
  );
}

/**
 * The header's refresh control, on both surfaces.
 *
 * It reloads the page rather than refetching the board. Trending and the
 * catalogue are both read once per page load and then held for the tab, so a
 * reload is the one action that refreshes everything the reader is looking at
 * instead of one query out of two.
 *
 * The press is one-way: nothing comes back to clear `reloading`, so the
 * spinner and the held-down button stand until the document is replaced. That
 * is the point. A control that snapped back to idle in the half second before
 * the page went away would read as a press that did nothing.
 */
function TrendingRefresh({ reload }: { reload: () => void }) {
  const t = useTranslations("memeScreener");
  const [reloading, setReloading] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setReloading(true);
        reload();
      }}
      // Held down from the first press, so an impatient reader cannot fire a
      // second reload into the one already under way.
      disabled={reloading}
      aria-busy={reloading}
      // The name says which of the two states the button is in, for a reader
      // who cannot see the spin.
      aria-label={reloading ? t("trendingRefreshing") : t("trendingRefresh")}
      data-control="trending-refresh"
      className={`${ICON_BUTTON} ${reloading ? REFRESH_BUSY : ICON_BUTTON_IDLE}`}
    >
      <RefreshIcon
        size={13}
        // The spin carries the in-flight state. Reduced motion drops it and
        // leaves the held-down button and aria-busy saying the same thing.
        className={reloading ? "animate-spin motion-reduce:animate-none" : undefined}
      />
    </button>
  );
}

export function MemeTrendingStrip({
  variant,
  tokens,
  rankOffset,
  heat,
  timeframe,
  page,
  pages,
  onPageChange,
  filtered,
  isLoading,
  error,
  onRetry,
  selectedKey,
  onSelect,
  reload = reloadPage,
}: MemeTrendingStripProps) {
  const t = useTranslations("memeScreener");
  const tMeme = useTranslations("meme");
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const desk = variant === "desk";

  // A failed refresh with cards in hand keeps them, as the table keeps its
  // rows. Only a failure with nothing to show takes the strip over.
  const failed = error !== null && error !== undefined && tokens.length === 0;
  const showing = !isLoading && !failed && tokens.length > 0;
  const pager =
    showing && pages > 1 ? (
      <TrendingPager page={page} pages={pages} onPageChange={onPageChange} />
    ) : null;

  const body = isLoading ? (
    <div
      aria-hidden="true"
      data-skeleton="trending-row"
      className={desk ? `${TRENDING_GRID} h-full` : TRENDING_GRID}
    >
      {Array.from({ length: PAGE_SIZE[variant] }, (_, i) => (
        <MemeTrendingCardSkeleton key={i} variant={variant} />
      ))}
    </div>
  ) : failed ? (
    <div className="grid h-full place-items-center content-center gap-2 py-3 text-center font-sans text-[13px] font-normal text-white/45">
      <span>{t("trendingUnavailable")}</span>
      <button type="button" onClick={onRetry} className={RETRY_PILL}>
        {tMeme("retry")}
      </button>
    </div>
  ) : showing ? (
    // Keyed by page so a new page's cards stagger in rather than swapping in
    // place, and a phone scroller starts again from its first card.
    <div
      key={page}
      data-region="trending-scroller"
      className={desk ? `${TRENDING_GRID} h-full` : TRENDING_GRID}
    >
      {tokens.map((token, i) => {
        const key = catalogKey(token);
        return (
          <MemeTrendingCard
            key={key}
            token={token}
            rank={rankOffset + i + 1}
            index={i}
            heat={heat.get(key) ?? null}
            timeframe={timeframe}
            selected={selectedKey === key}
            reduceMotion={reduceMotion}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  ) : (
    <div className="grid h-full place-items-center py-3 text-center font-sans text-[13px] font-normal text-white/45">
      {filtered ? t("trendingEmptyFiltered") : t("trendingEmpty")}
    </div>
  );

  return (
    <section
      data-region="trending"
      aria-labelledby={titleId}
      style={
        desk
          ? { minHeight: TRENDING_DESK_HEIGHT }
          : ({ "--trending-card-h": PHONE_CARD_HEIGHT } as CSSProperties)
      }
      className={
        desk
          ? "border-hairline bg-surface rounded-card flex shrink-0 flex-col gap-2 overflow-hidden border px-[14px] py-[10px]"
          : "flex flex-col gap-2"
      }
    >
      <div className="flex h-7 shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-kash flex shrink-0 items-center">
            <FlameIcon size={14} />
          </span>
          <h2
            id={titleId}
            className="font-serif text-[13px] font-semibold tracking-[-0.02em] whitespace-nowrap text-white"
          >
            {t("trendingTitle")}
          </h2>
          <span className="truncate font-sans text-[11px] font-normal text-white/45">
            {filtered
              ? t("trendingFiltered")
              : t("trendingSubtitle", { timeframe: t(timeframeLabelKey(timeframe)) })}
          </span>
        </div>
        {/* Refresh sits at the header's right on both surfaces, next to the
            pager where the desk shows one. `shrink-0` so a long subtitle
            truncates against it rather than pushing it off a phone. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <TrendingRefresh reload={reload} />
          {desk ? pager : null}
        </div>
      </div>

      {/* The cards read this box's width, not the window's, to choose their
          arrangement. See TRENDING_GRID. */}
      <div className={desk ? "@container min-h-0 flex-1" : "@container"}>{body}</div>

      {!desk && pager ? <div className="flex justify-center">{pager}</div> : null}
    </section>
  );
}
