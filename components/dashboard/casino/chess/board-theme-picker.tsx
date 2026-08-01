"use client";

import { BOARD_THEMES, setBoardTheme, useBoardTheme } from "@/lib/casino/chess/board-theme";

// A compact row of board-palette swatches. Each swatch is a two-square preview
// in the theme's own colours, so the choice reads at a glance. Removable on its
// own: drop this component and the board falls back to the grey default.
export function BoardThemePicker({ className = "" }: { className?: string }) {
  const active = useBoardTheme();
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {BOARD_THEMES.map((theme) => {
        const selected = theme.id === active.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setBoardTheme(theme.id)}
            aria-label={`Board: ${theme.label}`}
            aria-pressed={selected}
            title={theme.label}
            className={`h-6 w-6 overflow-hidden rounded-[5px] border transition-colors ${
              selected ? "border-accent" : "border-white/15 hover:border-white/40"
            }`}
          >
            <span className="grid h-full w-full grid-cols-2 grid-rows-2">
              <span style={{ background: theme.light }} />
              <span style={{ background: theme.dark }} />
              <span style={{ background: theme.dark }} />
              <span style={{ background: theme.light }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
