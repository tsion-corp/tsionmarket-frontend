"use client";

import { useTranslations } from "next-intl";
import { WAYPOINTS } from "@/lib/landing/journey";

// The waypoint dot navigation on the right edge. The active dot brightens and
// scales and its label fades in — all driven imperatively by the scroll
// engine; this component only renders the skeleton. Hidden on narrow
// viewports, where the dots would crowd the copy.

interface JourneyRailProps {
  onNavigate: (waypoint: number) => void;
}

export function JourneyRail({ onNavigate }: JourneyRailProps) {
  const t = useTranslations("landing.journey");
  return (
    <nav
      data-rail=""
      // The page has two nav landmarks (top bar + this rail); the label keeps
      // them distinguishable for assistive tech.
      aria-label={t("railLabel")}
      className="fixed top-1/2 right-[22px] z-[280] hidden -translate-y-1/2 flex-col items-end gap-3 min-[900px]:flex"
    >
      {Array.from({ length: WAYPOINTS }, (_, i) => {
        const label = t(`rail${i}`);
        return (
          <button
            key={i}
            type="button"
            data-rail-dot=""
            onClick={() => onNavigate(i)}
            aria-label={label}
            className="flex cursor-pointer items-center gap-2.5"
          >
            <span
              data-rail-label=""
              className="text-[10.5px] font-medium tracking-[0.12em] text-[rgba(244,244,244,0.55)] uppercase opacity-0 transition-opacity duration-300"
            >
              {label}
            </span>
            <span
              data-rail-ind=""
              className="block h-1.5 w-1.5 rounded-full bg-[rgba(244,244,244,0.3)] transition-[background,transform] duration-300"
            />
          </button>
        );
      })}
    </nav>
  );
}
