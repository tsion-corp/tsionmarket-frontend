"use client";

import { useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

// Limit or market. The panel below the strip reads this to decide whether it
// needs a price field; nothing here knows about that.
export type SpotOrderMode = "limit" | "market";

const MODES: readonly SpotOrderMode[] = ["limit", "market"];

export interface SpotOrderModeToggleProps {
  mode: SpotOrderMode;
  // Fires only when the picked option differs from the current one.
  onModeChange: (mode: SpotOrderMode) => void;
  className?: string;
}

// Which option an arrow, Home, or End key moves to. Returns null for any other
// key so the handler can leave the event alone.
function keyTarget(from: SpotOrderMode, key: string): SpotOrderMode | null {
  const i = MODES.indexOf(from);
  if (key === "ArrowLeft" || key === "ArrowUp") return MODES[(i + MODES.length - 1) % MODES.length];
  if (key === "ArrowRight" || key === "ArrowDown") return MODES[(i + 1) % MODES.length];
  if (key === "Home") return MODES[0];
  if (key === "End") return MODES[MODES.length - 1];
  return null;
}

// The segmented Limit/Market control on the trade panel's top strip. Two real
// buttons in a labelled group, so a keyboard reaches both by Tab and moves
// between them with the arrow keys. Controlled: the composer holds the mode.
export function SpotOrderModeToggle({ mode, onModeChange, className }: SpotOrderModeToggleProps) {
  const t = useTranslations("spot");
  const groupRef = useRef<HTMLDivElement>(null);

  const pick = (next: SpotOrderMode) => {
    if (next !== mode) onModeChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, from: SpotOrderMode) => {
    const next = keyTarget(from, event.key);
    if (!next) return;
    // Stop the arrow key from scrolling the panel.
    event.preventDefault();
    pick(next);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={t("orderType")}
      // ws-inset paints the track's radius and ground, but its border is the
      // 1px at 8% white the rest of the app's field containers use. This
      // control is drawn heavier: 1.686px at 12% (Figma 173:42180). The
      // utility has call sites elsewhere, so the weight and the colour are
      // overridden here. Both are single-property utilities, which Tailwind
      // emits after a multi-property one like ws-inset, so they win on order
      // without !important.
      className={`ws-inset flex items-center gap-[4.5px] border-[1.686px] border-[rgba(255,255,255,0.12)] p-[4.5px] ${className ?? ""}`}
    >
      {MODES.map((option) => {
        const on = option === mode;
        return (
          <button
            key={option}
            type="button"
            data-mode={option}
            aria-pressed={on}
            onClick={() => pick(option)}
            onKeyDown={(event) => onKeyDown(event, option)}
            // leading-none is the design's line box for the segment label. The
            // Tailwind default of 1.5 adds 7.75px to it, which the track's
            // padding and border carry straight into the panel's rhythm.
            // Nothing here is height-constrained, so a taller string in
            // another locale still grows the control rather than being cut.
            className={
              "ws-discovery-title cursor-pointer rounded-xl px-[18px] py-[6.75px] text-[15.5px] leading-none whitespace-nowrap transition-colors " +
              "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 " +
              "focus-visible:ring-offset-black focus-visible:outline-none " +
              (on ? "bg-surface-strong text-white" : "text-white/50 hover:text-white/80")
            }
          >
            {option === "limit" ? t("limit") : t("market")}
          </button>
        );
      })}
    </div>
  );
}
