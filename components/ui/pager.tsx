"use client";

import { ChevronLeftIcon } from "@/components/ui/icons";

interface PagerProps {
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  // Optional noun for the running count, e.g. "winners" → "1–10 of 24 winners".
  label?: string;
}

// Compact prev/next pager for the vault's capped feeds. Shows the visible range
// out of the total and disables at the ends. Kept deliberately small so it sits
// cleanly under a glass card without competing with the content.
export function Pager({ from, to, total, canPrev, canNext, onPrev, onNext, label }: PagerProps) {
  const btn =
    "grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/60";
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
      <span className="tnum text-[11px] font-medium text-white/40">
        {from}–{to} of {total}
        {label ? ` ${label}` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous page"
          className={btn}
        >
          <ChevronLeftIcon size={14} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next page"
          className={btn}
        >
          <ChevronLeftIcon size={14} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}
