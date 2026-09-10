"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/components/ui/icons";

interface ContinueBarProps {
  selectedTitle: string | null;
  onContinue: () => void;
  onSkip: () => void;
}

export function ContinueBar({ selectedTitle, onContinue, onSkip }: ContinueBarProps) {
  const t = useTranslations("interests");
  const enabled = selectedTitle !== null;
  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 flex justify-center bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.85)_40%,#000_100%)] px-6 pt-4 pb-[22px]">
      <div className="ws-glass flex w-[min(760px,100%)] items-center justify-between gap-[18px] rounded-full py-3 pr-3 pl-[22px]">
        <span className="text-sm font-normal text-white/85">
          {selectedTitle === null ? t("pickOne") : t("selectedLabel", { title: selectedTitle })}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            onClick={onSkip}
            className="rounded-full px-4 py-3 font-sans text-sm font-medium text-white/70 hover:text-white"
          >
            {t("skip")}
          </Link>
          <button
            onClick={onContinue}
            disabled={!enabled}
            className={`text-ink inline-flex items-center gap-2 rounded-full bg-white px-6 py-[13px] font-sans text-sm font-semibold transition-opacity ${
              enabled ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed opacity-40"
            }`}
          >
            {t("continue")}
            <ArrowRightIcon className="text-arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
