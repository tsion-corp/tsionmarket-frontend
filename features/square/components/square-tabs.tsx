"use client";

import { useCallback, useRef } from "react";

export interface SquareTab {
  id: string;
  label: string;
}

/**
 * The feed's tab strip: sticky, and horizontally scrollable when it overflows.
 *
 * Three things the accessible-tabs guidance is explicit about, and which a row
 * of styled buttons usually gets wrong:
 *
 *  1. **It is a real tablist.** `role="tablist"`/`role="tab"` with
 *     `aria-selected`, so a screen reader announces "tab 2 of 9" rather than
 *     reading nine unrelated buttons.
 *  2. **Arrow keys move between tabs; Tab does not.** A roving tabindex means
 *     only the active tab is a tab stop, so a keyboard user steps INTO the
 *     strip once and arrows across — rather than pressing Tab nine times to
 *     get past it to the feed. Home/End jump to the ends.
 *  3. **The active state is never colour alone.** It carries an underline and
 *     a weight change too, so it survives high-contrast mode and colour
 *     blindness.
 *
 * The strip fades at its right edge while there is more to scroll to — the
 * affordance that says "this moves" without spending space on arrows.
 */
export function SquareTabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: SquareTab[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = tabs.findIndex((tab) => tab.id === active);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;

      event.preventDefault();
      const target = tabs[next];
      if (!target) return;
      onSelect(target.id);
      // Move focus with the selection and bring it into view, so arrowing to a
      // tab scrolled off-screen does not silently lose the caret.
      const node = stripRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${CSS.escape(target.id)}"]`
      );
      node?.focus();
      // Optional-called: scrolling into view is a nicety and must never be the
      // reason SELECTION fails. Not every environment implements it (jsdom
      // does not), and throwing here would focus a tab that was never selected.
      node?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    },
    [tabs, active, onSelect]
  );

  return (
    <div className="relative">
      <div
        ref={stripRef}
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className="ws-no-scrollbar flex gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={onKeyDown}
              className={
                "relative shrink-0 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors " +
                "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 " +
                "focus-visible:ring-offset-black focus-visible:outline-none " +
                (selected
                  ? "font-semibold text-white"
                  : "text-grey-500 hover:text-grey-200 font-medium")
              }
            >
              {tab.label}
              {/* The non-colour half of the active state. */}
              <span
                aria-hidden
                className={
                  "absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-opacity " +
                  (selected ? "bg-accent opacity-100" : "opacity-0")
                }
              />
            </button>
          );
        })}
      </div>
      {/* "There is more this way." Non-interactive, so it never eats a tap on
          the tab underneath it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/70 to-transparent"
      />
    </div>
  );
}
