"use client";

import { useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@/components/ui/icons";

interface SheetNavProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

// Header for a sub-screen inside the funds and withdraw sheets. The back button
// steps one screen back without closing the sheet.
//
// A phone follows the sheet design: a round back button sitting beside the
// title, where a thumb reaches it. From `md` up the sheet is a centred dialog
// and keeps the text link stacked above the title.
export function SheetNav({ title, subtitle, onBack }: SheetNavProps) {
  const t = useTranslations("fundsFlow");
  return (
    <div className="mb-4">
      <button
        onClick={onBack}
        className="mb-3 hidden cursor-pointer items-center gap-1.5 text-[13px] font-normal text-white/60 hover:text-white md:inline-flex"
      >
        <ChevronLeftIcon size={14} />
        {t("back")}
      </button>
      <div className="flex items-center gap-3 md:block">
        <button
          onClick={onBack}
          aria-label={t("back")}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/75 transition-colors hover:bg-white/12 hover:text-white md:hidden"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <div className="ws-display min-w-0 text-[22px] tracking-[-0.01em] md:text-[24px]">
          {title}
        </div>
      </div>
      {subtitle ? (
        <p className="mt-1.5 text-[13.5px] leading-normal font-normal text-white/60">{subtitle}</p>
      ) : null}
    </div>
  );
}
