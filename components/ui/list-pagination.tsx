"use client";

import { useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@/components/ui/icons";

// Prev / "Page X of Y" / Next, sized for a phone. Shared by every paged list in
// the app so they page the same way; `page` and `pages` are 1-based, and the
// whole bar hides itself when there is only one page.
interface ListPaginationProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

export function ListPagination({ page, pages, onPage }: ListPaginationProps) {
  const t = useTranslations("common");
  if (pages <= 1) return null;

  const atStart = page <= 1;
  const atEnd = page >= pages;

  return (
    <div className="flex items-center justify-between border-t border-white/6 px-4 py-3 sm:px-6">
      <button
        onClick={() => onPage(page - 1)}
        disabled={atStart}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[12.5px] font-medium transition-colors ${
          atStart
            ? "cursor-not-allowed border-white/8 text-white/30"
            : "cursor-pointer border-white/12 bg-white/5 text-white/75 hover:text-white"
        }`}
      >
        <ChevronLeftIcon />
        {t("prev")}
      </button>

      <span className="tnum text-[12.5px] font-medium text-white/55">
        {t("pageOf", { page, pages })}
      </span>

      <button
        onClick={() => onPage(page + 1)}
        disabled={atEnd}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[12.5px] font-medium transition-colors ${
          atEnd
            ? "cursor-not-allowed border-white/8 text-white/30"
            : "cursor-pointer border-white/12 bg-white/5 text-white/75 hover:text-white"
        }`}
      >
        {t("next")}
        <span className="rotate-180">
          <ChevronLeftIcon />
        </span>
      </button>
    </div>
  );
}
