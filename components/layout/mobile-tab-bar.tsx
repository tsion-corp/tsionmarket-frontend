"use client";

import { useTranslations } from "next-intl";
import { DotsIcon, PlusIcon } from "@/components/ui/icons";
import { GoLiveControl } from "@/components/broadcast/go-live-control";
import type { NavItem } from "@/components/layout/nav-items";
import type { SectionId } from "@/lib/sections";

interface MobileTabBarProps {
  items: NavItem[];
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  /** Opens the drawer holding the sections that did not fit in the bar. */
  onOpenMore: () => void;
  onAddFunds: () => void;
}

// Sections that fit in the bar itself. The rest stay reachable through "More",
// which opens the same drawer the sidebar already provides, so the phone never
// loses a destination the desktop rail has.
// Three tabs plus More gives FOUR items to flank the centre node — two a
// side, so Go Live is genuinely in the middle. With four tabs the bar had five
// flanking items and the node could only ever sit off-centre.
const TAB_COUNT = 3;

// The phone's primary navigation: a floating pill of the first few sections
// with the active one labelled, and a separate round button for adding funds.
// Replaces the section chips on a phone; from `md` up the left rail takes over
// and this is not rendered at all.
export function MobileTabBar({
  items,
  activeSection,
  onNavigate,
  onOpenMore,
  onAddFunds,
}: MobileTabBarProps) {
  const t = useTranslations("topbar");
  const tabs = items.slice(0, TAB_COUNT);
  // Go Live belongs in the MIDDLE of the bar, not fourth of five. It is the one
  // control that must be reachable from every route, so it gets the steadiest
  // spot: dead centre, in the easy thumb zone, flanked by equal halves.
  // More renders on the right, so the left takes one more tab than the right.
  const leading = tabs.slice(0, Math.ceil((tabs.length + 1) / 2));
  const trailing = tabs.slice(leading.length);
  // Anything reached from the drawer keeps "More" lit, so the bar always shows
  // where the user is rather than going blank on, say, Arkade.
  const moreActive = !tabs.some((tab) => tab.id === activeSection);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-90 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label={t("sections")}
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-visible rounded-full border border-white/12 bg-[#141416]/92 p-1.5 pt-1.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.95)] backdrop-blur-[18px]"
      >
        {leading.map((tab) => {
          const active = tab.id === activeSection;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 cursor-pointer items-center gap-1.5 rounded-full transition-colors ${
                active
                  ? "bg-white/14 px-3.5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  : "w-11 justify-center text-white/50"
              }`}
            >
              <tab.icon size={21} />
              {active ? (
                <span className="font-sans text-[12.5px] font-medium whitespace-nowrap">
                  {tab.label}
                </span>
              ) : null}
            </button>
          );
        })}

        {/* The centre action, in the row rather than above it. A raised node
            overflowed this bar: the pattern assumes a full-width bar with room
            above, and this is a floating pill with neither. It stays the one
            different thing in the row through colour, not elevation. */}
        <span className="relative px-0.5">
          <GoLiveControl variant="tab" />
        </span>

        {trailing.map((tab) => {
          const active = tab.id === activeSection;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 cursor-pointer items-center gap-1.5 rounded-full transition-colors ${
                active
                  ? "bg-white/14 px-3.5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  : "w-11 justify-center text-white/50"
              }`}
            >
              <tab.icon size={21} />
              {active ? (
                <span className="font-sans text-[12.5px] font-medium whitespace-nowrap">
                  {tab.label}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          data-tour="more"
          onClick={onOpenMore}
          aria-label={t("menu")}
          className={`flex h-11 cursor-pointer items-center gap-1.5 rounded-full transition-colors ${
            moreActive
              ? "bg-white/14 px-3.5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
              : "w-11 justify-center text-white/50"
          }`}
        >
          <DotsIcon size={21} />
          {moreActive ? (
            <span className="font-sans text-[12.5px] font-medium whitespace-nowrap">
              {t("more")}
            </span>
          ) : null}
        </button>
      </nav>

      <button
        type="button"
        data-tour="add-funds"
        onClick={onAddFunds}
        aria-label={t("addFunds")}
        className="pointer-events-auto ml-2 grid size-[52px] shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 bg-[#141416]/92 text-white shadow-[0_18px_50px_-16px_rgba(0,0,0,0.95)] backdrop-blur-[18px] transition-colors hover:bg-white/12"
      >
        <PlusIcon size={22} />
      </button>
    </div>
  );
}
