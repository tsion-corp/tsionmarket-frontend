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
const TAB_COUNT = 4;

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
  // Anything reached from the drawer keeps "More" lit, so the bar always shows
  // where the user is rather than going blank on, say, Arkade.
  const moreActive = !tabs.some((tab) => tab.id === activeSection);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-90 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label={t("sections")}
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/12 bg-[#141416]/92 p-1.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.95)] backdrop-blur-[18px]"
      >
        {tabs.map((tab) => {
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

        {/* The centre node. It breaks the bar's top edge so it reads as
            floating, while staying part of the bar rather than covering the
            page: M3 forbids a FAB that obstructs the navigation bar, and a
            free-floating button permanently hides content beneath it. */}
        <span className="relative -mt-5 px-0.5">
          <GoLiveControl variant="tab" />
        </span>

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
