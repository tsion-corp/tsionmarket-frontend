"use client";

import { useId, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, FlameIcon } from "@/components/ui/icons";
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

// Three across on the desk. Four made each card narrow enough that a long
// change figure was cut mid-number, which is how "+2323839..." reached the
// screen; three gives the figure room to finish.
export const TRENDING_DESK_PAGE_SIZE = 3;
// Four on a phone as well, which the grid draws two by two. A side-scroller
// held five but cut the card at the screen's edge, and a card sliced down the
// middle reads as broken rather than as an invitation to swipe.
export const TRENDING_PHONE_PAGE_SIZE = 4;

export { TRENDING_MIN_CARD_PX };

// The desk strip's height with its cards in one row, and its floor in every
// state. The token list under it fits whole rows into what the left column has
// left, so a strip that changed height between loading, error and data would
// repaginate the table under the reader. 20px of padding, a 28px header, an 8px
// gap, and 114px for cards that need 107px (a 28px coin line, the 18px change,
// the 14px what-if line, the 7px heat bar, three 6px gaps and the card's own
// padding and border). A column too narrow for four cards wraps them onto a
// second row and the strip grows with them, which is a change in width, not a
// change in state, so the table is not repaginated under anyone.
export const TRENDING_DESK_HEIGHT = 172;

// One card a cell, as many whole cards across as the box can hold, on both
// surfaces. Four cards fit a desk's left column in one row; at about 1024px,
// where that column is near 480px, and on a phone, they wrap two by two
// instead of being crushed or sliced.
// Written out, not built from TRENDING_MIN_CARD_PX: Tailwind reads class names
// out of the source as plain text, so a class assembled at runtime is never
// generated. A test keeps the two in step.
const DESK_GRID =
  "grid auto-rows-fr gap-2 [grid-template-columns:repeat(auto-fit,minmax(156px,1fr))]";

// A phone card's height, held in a variable so a skeleton stands exactly as
// tall as the card it stands in for and the list below does not jump when
// trending lands. The desk's cards take their height from the strip instead.
const PHONE_CARD_HEIGHT = "107px";

const PAGE_SIZE: Record<TrendingVariant, number> = {
  desk: TRENDING_DESK_PAGE_SIZE,
  phone: TRENDING_PHONE_PAGE_SIZE,
};

// Pager's buttons, one step smaller, so the strip's pager cannot be mistaken
// for the table's numbered one.
const PAGER_BUTTON =
  "grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/60";

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
      className={desk ? `${DESK_GRID} h-full` : DESK_GRID}
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
      className={desk ? `${DESK_GRID} h-full` : DESK_GRID}
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
        {desk ? pager : null}
      </div>

      <div className={desk ? "min-h-0 flex-1" : undefined}>{body}</div>

      {!desk && pager ? <div className="flex justify-center">{pager}</div> : null}
    </section>
  );
}
