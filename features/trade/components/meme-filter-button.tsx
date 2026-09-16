"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RiskFilter } from "@/features/trade/components/meme-risk-filter";
import type { TokenRiskLevel } from "@/lib/meme/api";

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface MemeFilterButtonProps {
  active: Set<TokenRiskLevel>;
  onToggle: (level: TokenRiskLevel) => void;
  onClear: () => void;
  counts: Map<TokenRiskLevel, number>;
}

// The risk bands, behind a button rather than laid out as a row of chips.
//
// The trending shortlist wears its chips openly because there are five coins
// under them and the counts are the point. The catalogue is long, and a row of
// chips above it competes with the coins for the eye, so here the same control
// lives in a panel and the button carries a count of what is on.
export function MemeFilterButton({ active, onToggle, onClear, counts }: MemeFilterButtonProps) {
  const t = useTranslations("meme");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // A panel that outlives the click that closed it is the usual bug here, so it
  // closes on any click outside and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-11 cursor-pointer items-center gap-2 rounded-[14px] border px-4 font-sans text-[13.5px] font-medium transition-colors ${
          active.size > 0
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/12 bg-white/4 text-white/60 hover:border-white/25 hover:text-white"
        }`}
      >
        <FilterIcon />
        {t("filters")}
        {active.size > 0 ? (
          <span className="tnum bg-accent/20 text-accent grid size-5 place-items-center rounded-full text-[11px]">
            {active.size}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            role="dialog"
            aria-label={t("filters")}
            className="bg-panel absolute right-0 z-30 mt-2 w-[300px] rounded-[16px] border border-white/12 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-3 text-[11.5px] font-normal tracking-[0.08em] text-white/40 uppercase">
              {t("colRisk")}
            </div>
            <RiskFilter active={active} onToggle={onToggle} onClear={onClear} counts={counts} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
