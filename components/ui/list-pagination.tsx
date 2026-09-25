"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@/components/ui/icons";

// Prev / "Page X of Y" / Next, sized for a phone. Shared by every paged list in
// the app so they page the same way; `page` and `pages` are 1-based, and the
// whole bar hides itself when there is only one page and nothing more to come.
interface ListPaginationProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  /**
   * The list holds more rows than have been loaded, so `pages` is a running
   * count rather than a final one. The bar says so instead of letting a
   * hundred thousand coins read as three pages.
   *
   * Next stays shut on the last loaded page: there is no page to step to yet.
   * The rows behind it arrive on their own and `pages` grows with them.
   */
  more?: boolean;
  /** Of those rows, a batch is in flight right now. */
  loadingMore?: boolean;
  /**
   * Loading stopped short of the whole list and will not start again by
   * itself. The bar says the list is incomplete, and with `onResume` offers
   * the way to carry on. Without that the reader cannot tell from the rows
   * alone, and a list that quietly stopped reads as a finished one.
   */
  stalled?: boolean;
  /**
   * Loading is paused but will carry on by itself. Its own line, because a
   * reader who is told only that more pages exist cannot tell a pause from a
   * stop, and pressing anything here would be wasted.
   */
  waiting?: boolean;
  /** Restarts a stalled load. The resume button is drawn only when given. */
  onResume?: () => void;
}

const STEP_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[12.5px] font-medium transition-colors";
const STEP_ON = "cursor-pointer border-white/12 bg-white/5 text-white/75 hover:text-white";
const STEP_OFF = "cursor-not-allowed border-white/8 text-white/30";

export function ListPagination({
  page,
  pages,
  onPage,
  more = false,
  loadingMore = false,
  stalled = false,
  waiting = false,
  onResume,
}: ListPaginationProps) {
  const t = useTranslations("common");
  // Grouped, so ten thousand pages reads as "10,000" rather than "10000".
  // Done here rather than in the catalogues because every locale's copy of
  // common.pageOf would otherwise have to be edited to say the same thing.
  const format = useFormatter();
  // A stalled load has rows outstanding whether or not the caller also said
  // `more`, so it keeps the bar up on its own.
  const incomplete = more || stalled;
  if (pages <= 1 && !incomplete) return null;

  const atStart = page <= 1;
  const atEnd = page >= pages;

  // One line, four things it can say. Stalled wins: nothing is coming and the
  // reader is the only one who can change that.
  const hint = stalled
    ? t("moreStalled")
    : loadingMore
      ? t("moreLoading")
      : waiting
        ? t("moreWaiting")
        : t("morePages");

  return (
    <div className="border-t border-white/6 px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between">
      <button
        onClick={() => onPage(page - 1)}
        disabled={atStart}
        className={`${STEP_BUTTON} ${atStart ? STEP_OFF : STEP_ON}`}
      >
        <ChevronLeftIcon />
        {t("prev")}
      </button>

      <span className="flex min-w-0 flex-col items-center text-center">
        <span className="tnum text-[12.5px] font-medium text-white/55">
          {t("pageOf", { page: format.number(page), pages: format.number(pages) })}
          {/* The same "count is not final" mark the numbered bar uses, so a
              reader moving between the desk and a phone reads one language. */}
          {incomplete ? <span aria-hidden="true">…</span> : null}
        </span>
        {incomplete ? (
          // The line is reserved for as long as there are rows to come, so the
          // bar does not change height between one batch landing and the next
          // going out, which on a phone would shunt the list under the reader.
          <span className="block h-[13px] font-sans text-[10.5px] font-normal text-white/40">
            {hint}
          </span>
        ) : null}
      </span>

      <button
        onClick={() => onPage(page + 1)}
        disabled={atEnd}
        className={`${STEP_BUTTON} ${atEnd ? STEP_OFF : STEP_ON}`}
      >
        {t("next")}
        <span className="rotate-180">
          <ChevronLeftIcon />
        </span>
      </button>
      </div>

      {stalled && onResume ? (
        // Its own row under the stepper rather than a link on the hint line:
        // that line is 13px tall, which is not a tap target on a phone, and the
        // button borrows Prev and Next's shape so the bar keeps one vocabulary.
        // The row only ever appears once, when the load gives up, so it does not
        // shunt the list under a reader who is scrolling it.
        <div className="mt-2.5 flex justify-center">
          <button type="button" onClick={onResume} className={`${STEP_BUTTON} ${STEP_ON}`}>
            {t("moreResume")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
