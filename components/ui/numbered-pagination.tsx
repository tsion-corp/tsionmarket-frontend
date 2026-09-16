"use client";

import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ChevronLeftIcon } from "@/components/ui/icons";

export type PageWindowItem = number | "gap";

// Seven slots: the first page, the last, and the current one with a neighbour
// either side, joined by gaps. Near an end the gap on that side would stand in
// for a single page, so the window slides to show it instead.
const MAX_SLOTS = 7;

/**
 * The page buttons to draw for `page` of `pages`, both 1-based: every page
 * when seven or fewer fit, otherwise the ends and the current page's
 * neighbourhood with a gap for each run left out.
 */
export function pageWindow(page: number, pages: number): PageWindowItem[] {
  if (pages <= MAX_SLOTS) return Array.from({ length: pages }, (_, i) => i + 1);

  const current = Math.min(Math.max(1, page), pages);
  let start = current - 1;
  let end = current + 1;
  if (current <= 3) {
    start = 2;
    end = 4;
  } else if (current >= pages - 2) {
    start = pages - 3;
    end = pages - 1;
  }

  const items: PageWindowItem[] = [1];
  if (start > 2) items.push("gap");
  for (let n = start; n <= end; n++) items.push(n);
  if (end < pages - 1) items.push("gap");
  items.push(pages);
  return items;
}

interface NumberedPaginationProps {
  /** 1-based page showing. */
  page: number;
  /** Pages the rows held so far split into. */
  pages: number;
  onPage: (page: number) => void;
  /**
   * The list holds more than has been loaded. Next stays open on the last
   * loaded page, and a trailing "…" says the count is not final.
   */
  more?: boolean;
  /** The rows behind the last loaded page are on their way. */
  loadingMore?: boolean;
}

const STEP_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[12.5px] font-medium transition-colors";
const STEP_ON = "cursor-pointer border-white/12 bg-white/5 text-white/75 hover:text-white";
const STEP_OFF = "cursor-not-allowed border-white/8 text-white/30";

/**
 * Prev, a numbered page for every page there is, and Next. For a list long
 * enough that "Page 2 of 3" and a Prev/Next pair would hide how much there is
 * to browse. Prev and Next are ListPagination's own buttons, so a bar swapped
 * from one to the other keeps its height and the rows above it still fit.
 */
export function NumberedPagination({
  page,
  pages,
  onPage,
  more = false,
  loadingMore = false,
}: NumberedPaginationProps) {
  const t = useTranslations("common");
  if (pages <= 1 && !more) return null;

  const atStart = page <= 1;
  const onLastLoaded = page >= pages;
  // On the last loaded page Next opens rows that are still arriving, so it
  // waits for them rather than stepping onto an empty page.
  const waiting = onLastLoaded && more && loadingMore;
  const nextDisabled = (onLastLoaded && !more) || waiting;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/6 px-4 py-3 sm:px-6">
      {/* The numbers say where the reader is to the eye; this says it to a
          screen reader whenever the page changes. */}
      <p aria-live="polite" className="sr-only">
        {t("pageOf", { page, pages })}
      </p>

      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={atStart}
        className={`${STEP_BUTTON} shrink-0 ${atStart ? STEP_OFF : STEP_ON}`}
      >
        <ChevronLeftIcon />
        {t("prev")}
      </button>

      <div className="flex min-w-0 items-center gap-1">
        {pageWindow(page, pages).map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="w-5 text-center font-sans text-[12.5px] text-white/35"
            >
              …
            </span>
          ) : (
            // data-no-ripple: the global button lift would jostle a row of
            // numbers under the pointer. The fill is the feedback.
            <button
              key={item}
              type="button"
              data-no-ripple
              aria-label={t("pageNumber", { page: item })}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPage(item)}
              className={`tnum grid h-8 min-w-8 place-items-center rounded-full px-2 font-sans text-[12.5px] font-medium transition-colors ${
                item === page
                  ? "bg-white text-black"
                  : "cursor-pointer text-white/60 hover:bg-white/6 hover:text-white"
              }`}
            >
              {item}
            </button>
          )
        )}
        {more ? (
          <span className="w-5 text-center font-sans text-[12.5px] text-white/35">
            <span aria-hidden="true">…</span>
            <span className="sr-only">{t("morePages")}</span>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={nextDisabled}
        className={`${STEP_BUTTON} shrink-0 ${nextDisabled ? STEP_OFF : STEP_ON}`}
      >
        {waiting ? <ButtonSpinner /> : null}
        {t("next")}
        <span className="rotate-180">
          <ChevronLeftIcon />
        </span>
      </button>
    </div>
  );
}
