"use client";

import { useEffect, useRef } from "react";
import type { DashboardSection } from "@/lib/modal-types";
import { prefersReducedMotion } from "@/lib/scroll";

interface SectionChipsProps {
  sections: readonly { id: DashboardSection; label: string }[];
  activeId: DashboardSection;
  onSelect: (id: DashboardSection) => void;
}

export function SectionChips({ sections, activeId, onSelect }: SectionChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the active chip visible inside the horizontally scrolling row.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLButtonElement>(`[data-section="${activeId}"]`);
    if (!row || !chip) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16;
    if (left < row.scrollLeft) {
      row.scrollTo({ left, behavior });
    } else if (right > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: right - row.clientWidth, behavior });
    }
  }, [activeId]);

  return (
    <div
      ref={rowRef}
      className="relative flex [scrollbar-width:none] gap-2 overflow-x-auto border-b border-white/7 bg-black/70 px-4 py-2.5 backdrop-blur-[14px] md:hidden [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            data-section={s.id}
            onClick={() => onSelect(s.id)}
            className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[13px] font-medium whitespace-nowrap transition-colors ${
              active
                ? "border-accent/35 bg-accent/16 text-accent"
                : "border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
