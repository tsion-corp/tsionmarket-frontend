"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface PerpLedgerTab {
  /** Stable key, also the suffix of the tab's and panel's DOM ids. */
  id: string;
  /** Already translated. This component holds no catalog of its own. */
  label: string;
  /** Rendered only while the tab is selected. */
  panel: ReactNode;
}

interface PerpLedgerTabsProps {
  tabs: PerpLedgerTab[];
  /** Accessible name for the strip, e.g. "Trade ledger". Already translated. */
  label: string;
  /** Which tab opens first. Falls back to the first tab. */
  defaultTabId?: string;
  className?: string;
}

// The phone's ledger strip from the 2.0 "Leverage Trading" frame (Figma
// 1:7580, nodes 1:7722-1:7733): a row of pill-shaped tabs over a 3px rule, with
// a white segment of that rule under the selected one.
//
// Geometry from the comp: 101px tabs, 8px apart, a 12px SemiBold label at
// -0.36px tracking, #f4f4f4 when selected and white at 40% otherwise, and a
// 3px rule at rgba(255,255,255,0.08) with the selected segment in solid white.
// The one deliberate departure is height. The comp's tab is 38px, which is
// under the 44px a thumb needs, and this strip is the phone's only way between
// the ledgers, so the button is 44px tall and the rule still sits on its
// bottom edge. Nothing else moves.
//
// It is a real tablist: role="tablist"/role="tab" with aria-selected, one
// role="tabpanel" tied to the selected tab both ways, and a roving tabindex so
// a keyboard user steps into the strip once and arrows across it. Home and End
// jump to the ends.
//
// Presentational and self-contained. It takes labels already translated and
// panels already built, so it knows nothing about orders, positions or the
// venue, and it fetches nothing.
//
// This is the third hand-rolled tablist in the tree, after
// features/square/components/square-tabs.tsx and the market strip in
// features/trade/components/mobile-market-view.tsx. All three should collapse
// into one primitive under components/ui/ once the screens in flight have
// landed; features cannot import each other, so none of them can reuse another
// where it sits today.
export function PerpLedgerTabs({ tabs, label, defaultTabId, className }: PerpLedgerTabsProps) {
  const domId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  // A default naming no tab must still leave the strip with a selection, so the
  // first tab is the fallback for both an absent and an unknown default.
  const fallbackId = tabs[0]?.id ?? "";
  const [activeId, setActiveId] = useState(
    tabs.some((entry) => entry.id === defaultTabId) ? (defaultTabId as string) : fallbackId
  );

  const active = tabs.find((entry) => entry.id === activeId) ?? tabs[0];

  const tabDomId = (id: string) => `${domId}-tab-${id}`;
  const panelDomId = (id: string) => `${domId}-panel-${id}`;

  const select = useCallback((id: string, moveFocus: boolean) => {
    setActiveId(id);
    if (!moveFocus) return;
    // Queried out of the strip rather than held in a ref map: the tabs are a
    // list the caller owns and can change between renders.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const index = tabs.findIndex((entry) => entry.id === activeId);
      if (index < 0) return;

      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;

      event.preventDefault();
      const target = tabs[next];
      if (target) select(target.id, true);
    },
    [tabs, activeId, select]
  );

  if (tabs.length === 0 || !active) return null;

  return (
    <div className={`flex w-full flex-col gap-4 ${className ?? ""}`}>
      {/* The strip and its rule are one block: the rule is pinned to the
          bottom of the tab row so the selected tab's white segment lands
          exactly under its own label, at its own width, with no measuring. */}
      <div className="relative">
        <div
          ref={stripRef}
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((entry) => {
            const selected = entry.id === active.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={tabDomId(entry.id)}
                data-tab-id={entry.id}
                aria-selected={selected}
                aria-controls={panelDomId(entry.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(entry.id, false)}
                onKeyDown={onKeyDown}
                className={`relative flex h-11 w-[101px] min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[12px] leading-4 font-semibold tracking-[-0.36px] transition-colors ${
                  selected ? "text-[#f4f4f4]" : "text-white/40 hover:text-white/70"
                }`}
              >
                {entry.label}
                {selected && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Under the tabs, so the selected tab's own segment paints over it. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 -z-10 h-[3px] rounded-[2.4px] bg-white/8"
        />
      </div>

      {/* One panel at a time. A hidden second panel here would be a second
          positions list, with its own modals, sitting behind the visible one.
          tabIndex 0 because the panel is not always focusable by its content:
          a ledger that is empty or still loading has nothing to tab to. */}
      <div
        role="tabpanel"
        id={panelDomId(active.id)}
        aria-labelledby={tabDomId(active.id)}
        tabIndex={0}
        className="min-w-0 outline-none"
      >
        {active.panel}
      </div>
    </div>
  );
}
