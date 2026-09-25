"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { RiskFilter } from "@/features/trade/components/meme-risk-filter";
import { MODAL_PANEL_CLASS, useModalTrigger } from "@/features/trade/components/meme-sort-menu";
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
// lives in a modal and the button carries a count of what is on.
export function MemeFilterButton({ active, onToggle, onClear, counts }: MemeFilterButtonProps) {
  const t = useTranslations("meme");
  const { open, show, close, triggerRef, panelRef } = useModalTrigger();
  const dialogId = useId();
  const titleId = useId();

  // Focus goes to the dialog itself, so its title is read first and no band is
  // toggled by a stray key.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, panelRef]);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : show())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
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

      <ModalShell open={open} onClose={() => close(true)} panelClassName={MODAL_PANEL_CLASS}>
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="outline-none"
        >
          {/* Padded past the shell's close button so the title never runs under it. */}
          <div id={titleId} className="ws-display mb-4 pr-10 text-[20px]">
            {t("filters")}
          </div>
          <div className="mb-3 text-[11.5px] font-normal tracking-[0.08em] text-white/40 uppercase">
            {t("colRisk")}
          </div>
          <RiskFilter active={active} onToggle={onToggle} onClear={onClear} counts={counts} />
        </div>
      </ModalShell>
    </div>
  );
}
