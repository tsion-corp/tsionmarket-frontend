"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { guardNavigation } from "@/lib/navigation-guard";
import { ClockIcon } from "@/components/ui/icons";
import type { SectionId } from "@/lib/sections";
import type { NavItem } from "@/components/layout/nav-items";

// The icons, lifted straight from the Figma art (node 104:2688) so the
// glyphs match the dome exactly. Each keeps the art's own coordinates as its
// viewBox and is stroked in currentColor, so the parent sets bright-white for
// the centred tab and a dim wash for the rest with one text-colour class.
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
  // The section this slot lights up on, when it maps to one.
  section?: SectionId;
  Icon: (props: IconProps) => React.ReactElement;
}

// The bar's four destinations, in their resting left-to-right order.
const TABS: Tab[] = [
  { key: "portfolio", label: "Home", section: "portfolio", Icon: PortfolioIcon },
  { key: "market", label: "Market", section: "spot", Icon: MarketIcon },
  { key: "casino", label: "Arkade", section: "casino", Icon: CasinoIcon },
  { key: "activity", label: "Activity", section: "activity", Icon: ClockIcon },
];

// Seats along the dome, in screen order, as a share of the 402x90 art. The
// icons ride the arch, so seats nearer the middle sit higher. With nothing
// active the four tabs rest mirrored about the centre. With a tab active it
// takes the raised centre seat; the two seats left of it are mirrored by one
// seat right of it, placed where the left pair's midpoint reflects, so the
// weight on each side matches.
const REST_SEATS = [
  { x: 15.0, y: 74 },
  { x: 35.0, y: 43 },
  { x: 65.0, y: 43 },
  { x: 85.0, y: 74 },
] as const;
const ACTIVE_SEATS = [
  { x: 15.0, y: 74 },
  { x: 32.3, y: 46 },
  { x: 50.0, y: 30 },
  { x: 76.4, y: 60 },
] as const;
const CENTRE = 2;

interface CurvedTabBarProps {
  // Kept so this stays a drop-in for the old bar; the labels are the bar's own.
  items: NavItem[];
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
}

/**
 * The phone tab bar, drawn as the raised dome from the comp (Figma 104:2688).
 *
 * The purple arc and the title do NOT move: they are a fixed frame in the
 * centre. Whatever tab is active rides up into that centre seat, and the other
 * three keep their left-to-right order and close the gap it leaves. So switching
 * tabs reshuffles the icons THROUGH the centre rather than sliding an indicator
 * to them. Mobile only.
 */
export function CurvedTabBar({ items, activeSection, onNavigate }: CurvedTabBarProps) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // A screen may need to be asked before it is left. The seats that go through
  // onNavigate are asked there, in useAppNavigate; these two route from here,
  // so they ask for themselves. Either way there is no click for a listener to
  // catch, which is why the question is asked in code rather than in the DOM.
  const onTap = (tab: Tab) => {
    if (tab.key === "portfolio") onNavigate("portfolio");
    else if (tab.key === "market") {
      if (guardNavigation("/market")) return;
      router.push("/market");
    } else if (tab.key === "casino") onNavigate("casino");
    else {
      if (guardNavigation("/activity")) return;
      router.push("/activity");
    }
  };

  const activeTab = TABS.find((t) => t.section !== undefined && t.section === activeSection);
  // Reshuffle: pull the active tab out, keep the rest in order, and drop the
  // active one back into the centre seat. With nothing active the bar rests in
  // its natural order. The label under the dock is the nav's localized name.
  const others = TABS.filter((t) => t.key !== activeTab?.key);
  const ordered = activeTab
    ? [...others.slice(0, CENTRE), activeTab, ...others.slice(CENTRE)]
    : TABS;
  const seats = activeTab ? ACTIVE_SEATS : REST_SEATS;
  // The market seat borrows the "spot" section only to know which icon to
  // raise; its name is its own ("Market"), not the spot section's. Every other
  // seat takes the nav's localized section name.
  const activeLabel = activeTab
    ? activeTab.key === "market"
      ? activeTab.label
      : (items.find((i) => i.id === activeTab.section)?.label ?? activeTab.label)
    : null;

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 30 };

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-90 w-screen md:hidden">
      <div className="relative w-screen" style={{ aspectRatio: "402 / 90" }}>
        {/* The dome: surface, hairline and ray texture, no icons. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nav/dome-bg.svg" alt="" className="absolute inset-0 h-full w-full select-none" />

        {/* The fixed centre frame: the purple arc and the active section's name.
            Neither moves; only the name changes as the icons reshuffle under it. */}
        {activeTab ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nav/glow.svg"
              alt=""
              className="pointer-events-none absolute top-[63%] left-1/2 w-[21.5%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_6px_rgba(216,188,255,0.45)] select-none"
            />
            <AnimatePresence mode="wait">
              <motion.span
                key={activeLabel}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="pointer-events-none absolute top-[83%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[12px] font-semibold tracking-[-0.36px] whitespace-nowrap text-white"
              >
                {activeLabel}
              </motion.span>
            </AnimatePresence>
          </>
        ) : null}

        {/* The icons. Each animates to the seat its slot in `ordered` gives it,
            so the active one rides up to the centre and the others close the
            gap. Keyed by tab, so motion moves the same element. */}
        <nav aria-label="Primary" className="absolute inset-0">
          {ordered.map((tab, i) => {
            const seat = seats[i];
            const centred = activeTab !== undefined && i === CENTRE;
            return (
              <motion.button
                key={tab.key}
                type="button"
                onClick={() => onTap(tab)}
                aria-label={tab.label}
                aria-current={centred ? "page" : undefined}
                initial={false}
                animate={{ left: `${seat.x}%`, top: `${seat.y}%` }}
                transition={spring}
                className={`pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center ${
                  centred ? "text-white" : "text-white/50"
                }`}
              >
                <tab.Icon size={centred ? 26 : 23} />
              </motion.button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
