"use client";

import { useRouter } from "next/navigation";
import { guardNavigation } from "@/lib/navigation-guard";
import { ClockIcon } from "@/components/ui/icons";
import type { SectionId } from "@/lib/sections";
import type { NavItem } from "@/components/layout/nav-items";

type IconProps = { size?: number };

function PortfolioIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="50 53.5 22 22.5" fill="none">
      <path
        d="M57.9993 75L57.7487 71.4911C57.6139 69.6046 59.108 68 60.9993 68C62.8906 68 64.3847 69.6046 64.25 71.4911L63.9993 75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M51.3514 66.2135C50.9984 63.9162 50.8219 62.7676 51.2562 61.7494C51.6905 60.7311 52.654 60.0344 54.5811 58.6411L56.021 57.6C58.4183 55.8667 59.6169 55 61 55C62.3831 55 63.5817 55.8667 65.979 57.6L67.4189 58.6411C69.346 60.0344 70.3095 60.7311 70.7438 61.7494C71.1781 62.7676 71.0016 63.9162 70.6486 66.2135L70.3476 68.1724C69.8471 71.4289 69.5969 73.0572 68.429 74.0286C67.2611 75 65.5537 75 62.1388 75H59.8612C56.4463 75 54.7389 75 53.571 74.0286C52.4031 73.0572 52.1529 71.4289 51.6524 68.1724L51.3514 66.2135Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarketIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={(size * 15) / 17} viewBox="121 32.5 18 16" fill="none">
      <path
        d="M122.973 47.8717H138.865M124.959 47.8717V37.9393M128.932 47.8717V33.9663M132.905 47.8717V40.919M136.878 47.8717V36.946"
        stroke="currentColor"
        strokeWidth="1.78784"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CasinoIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="277 30 22 22" fill="none">
      <path
        d="M285.192 40.9811V44.5322"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M287.004 42.7561H283.381"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M291.373 41.0892H291.271"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M293.092 44.4782H292.99"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M284.457 31.2014C284.463 31.9107 285.044 32.4796 285.754 32.4729H286.755C287.85 32.4644 288.746 33.3425 288.761 34.4377V35.438"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M297.665 42.8017C297.665 37.2793 295.294 35.4379 288.182 35.4379C281.068 35.4379 278.698 37.2793 278.698 42.8017C278.698 48.3251 281.068 50.1656 288.182 50.1656C295.294 50.1656 297.665 48.3251 297.665 42.8017Z"
        stroke="currentColor"
        strokeWidth="1.48988"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Tab {
  key: string;
  label: string;
  // The section this tab lights up on, when it maps to one.
  section?: SectionId;
  Icon: (props: IconProps) => React.ReactElement;
}

// The bar's four destinations, left to right, fixed — no reordering.
const TABS: Tab[] = [
  { key: "portfolio", label: "Home", section: "portfolio", Icon: PortfolioIcon },
  { key: "market", label: "Market", section: "spot", Icon: MarketIcon },
  { key: "casino", label: "Arkade", section: "casino", Icon: CasinoIcon },
  { key: "activity", label: "Activity", section: "activity", Icon: ClockIcon },
];

interface TabBarProps {
  // Used only to localize each tab's label; Market keeps its own ("Market"
  // is this bar's name for the page, not the "Spot" section name it maps to).
  items: NavItem[];
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
}

/**
 * The phone bottom tab bar: four fixed destinations, one active at a time.
 * Mobile only.
 *
 * Market is the one special case: it maps to the "spot" section for the
 * purpose of lighting up, but it navigates to its own standalone phone page
 * (`/market`) rather than the section's normal route (`/spot`, the desktop
 * shell's page) — see app/(session)/market/page.tsx's own comment. Every
 * other tab goes through `onNavigate`, which already knows how to route or
 * scroll-spy and already asks the navigation guard before leaving a screen.
 */
export function TabBar({ items, activeSection, onNavigate }: TabBarProps) {
  const router = useRouter();

  const onTap = (tab: Tab) => {
    if (tab.key === "market") {
      if (guardNavigation("/market")) return;
      router.push("/market");
      return;
    }
    if (tab.section) onNavigate(tab.section);
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 z-90 flex w-screen justify-around border-t border-white/8 bg-black/95 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.section !== undefined && tab.section === activeSection;
        const label =
          tab.key === "market"
            ? tab.label
            : (items.find((i) => i.id === tab.section)?.label ?? tab.label);
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTap(tab)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 ${
              active ? "text-white" : "text-white/50"
            }`}
          >
            <tab.Icon size={23} />
            <span className="text-[11px] font-medium whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
