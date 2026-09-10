"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { marketSquareHref } from "@/lib/market-square";
import type { SectionId } from "@/lib/sections";
import type { NavItem } from "@/components/layout/nav-items";

// The curved bottom navigation (Figma node 104:2688). The bar art — the raised
// disc, the five dim icons, and the elevated centre card — is the designer's own
// export (nav-bar-base.svg), pixel-identical and scaling with the viewport. The
// active tab is marked by an outlined block that slides around its icon. Mobile
// only; a drop-in replacement for MobileTabBar.

interface CurvedTabBarProps {
  items: NavItem[];
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
}

// The icons that carry an active state, with their centre as a share of the
// 402x90 art (x across, y down). The centre card (Market Square) and the "More"
// slot are actions, not sections, so they never take the block.
const TABS: { id: SectionId; x: number; y: number }[] = [
  { id: "portfolio", x: 15.0, y: 72 },
  { id: "spot", x: 32.3, y: 48 },
  { id: "casino", x: 71.6, y: 50 },
  // The clock: drawn at (348.9, 69.9) in the 402x90 art.
  { id: "activity", x: 86.8, y: 77.7 },
];

// Tap zones over the art, left→right: portfolio, market, market square, casino, activity.
const ZONES = [
  { left: 0, width: 24 },
  { left: 24, width: 17 },
  { left: 41, width: 20 },
  { left: 61, width: 18 },
  { left: 79, width: 21 },
];

export function CurvedTabBar({ activeSection, onNavigate }: CurvedTabBarProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const squareHref = marketSquareHref() ?? "#";
  // Four icons carry an active state (portfolio, spot, casino, activity). On
  // any other section (rwa, meme, prediction, earn) none of them owns the
  // page, so the marker is hidden rather than snapping onto Portfolio.
  const active = TABS.find((t) => t.id === activeSection) ?? null;

  // The block scrolls across to the active icon instead of jumping.
  const slide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 32 };

  const onZone = (i: number) => {
    if (i === 0) onNavigate("portfolio");
    // The second icon opens the phone Market page (its own route, outside the
    // shell), so navigate rather than scroll-spy to a section.
    else if (i === 1) router.push("/market");
    else if (i === 2) {
      // A sibling deployment, so it opens beside the app, as the rail does.
      if (squareHref !== "#") window.open(squareHref, "_blank", "noopener,noreferrer");
    } else if (i === 3) onNavigate("casino");
    // The last icon opens the Activity page (its own route), not the drawer.
    else router.push("/activity");
  };

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-90 w-screen md:hidden">
      <div className="relative w-screen" style={{ aspectRatio: "402 / 90" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nav/nav-bar-base.svg"
          alt=""
          className="absolute inset-0 h-full w-full select-none"
        />

        {/* The active marker: a circle around the icon that slides to it. Only
            shown when the current section maps to one of the marked icons. */}
        {active ? (
          <motion.div
            animate={{ left: `${active.x}%`, top: `${active.y}%` }}
            transition={slide}
            className="pointer-events-none absolute aspect-square h-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[#D8BCFF]/70"
          />
        ) : null}

        <nav className="pointer-events-auto absolute inset-0" aria-label="Primary">
          {ZONES.map((z, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onZone(i)}
              className="absolute top-0 bottom-0 cursor-pointer"
              style={{ left: `${z.left}%`, width: `${z.width}%` }}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}
