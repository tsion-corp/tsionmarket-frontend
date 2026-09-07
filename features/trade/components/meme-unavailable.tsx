"use client";

import { useTranslations } from "next-intl";

// The list's failure state: what happened, and a way to ask again. Shown in
// place of the rows, never beside them, so a stale page is not mistaken for a
// fresh one.
export function MemeUnavailable({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("meme");
  return (
    <div className="ws-card mt-4 grid place-items-center gap-3 px-4 py-12 text-center text-[13px] font-normal text-white/45">
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
  );
}
