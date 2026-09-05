"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { DriveStep } from "driver.js";
import {
  consumeTourReplay,
  hasSeenDashboardTour,
  markDashboardTourSeen,
} from "@/features/tour/lib/tour-storage";

// The first-visit walkthrough of the dashboard. Copy lives in the `tour`
// namespace; the popover is restyled to the app's dark sheet by the
// `.ws-tour` rules in globals.css.

type Translate = (key: string) => string;

interface StepDef {
  key: string;
  side?: "top" | "right" | "bottom" | "left";
  /**
   * A chrome control (nav entry, tab bar button). Resolved and
   * breakpoint-checked when the tour starts: the other breakpoint's controls
   * are skipped, never pointed at while hidden.
   */
  chrome?: string;
  /**
   * A dashboard section, by the id the scroll-spy gives it. Included when the
   * section exists; the exact highlight target resolves lazily at the moment
   * the step shows, so content that loads after the tour starts is still
   * found. The target is the section's compact header, not the whole
   * viewport-tall section, which would leave nothing visibly dimmed.
   */
  section?: string;
}

// Order follows the page: money first, then each on-page section top to
// bottom, then the destinations that live on their own routes (via their nav
// entries), then the account.
const STEP_DEFS: StepDef[] = [
  { key: "welcome" },
  { key: "portfolio", section: "portfolio", side: "bottom" },
  { key: "kash", chrome: "[data-tour='kash']", side: "bottom" },
  { key: "addFunds", chrome: "[data-tour='add-funds']", side: "top" },
  { key: "spot", section: "spot", side: "bottom" },
  { key: "perps", chrome: "[data-tour-nav='perps']", side: "right" },
  { key: "meme", section: "meme", side: "bottom" },
  { key: "rwa", section: "rwa", side: "bottom" },
  { key: "prediction", chrome: "[data-tour-nav='prediction']", side: "right" },
  { key: "earn", chrome: "[data-tour-nav='earn']", side: "right" },
  { key: "casino", chrome: "[data-tour-nav='casino']", side: "right" },
  { key: "activity", chrome: "[data-tour-nav='activity']", side: "right" },
  { key: "more", chrome: "[data-tour='more']", side: "top" },
  { key: "profile", chrome: "[data-tour='profile']", side: "bottom" },
];

// On screen enough to point at: rendered, and horizontally inside the
// viewport. This is what keeps the phone's off-canvas sidebar (translated
// fully off to the left) and the desktop-hidden phone controls
// (display: none) out of the running.
function onScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth;
}

function findChrome(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    if (onScreen(el)) return el;
  }
  return null;
}

// The compact thing to spotlight inside a section, best first: a named
// anchor (the balance card, present once per breakpoint, so the visible one
// is picked), the eyebrow's header row, a heading's block, and only then the
// whole section.
function sectionAnchor(id: string): () => Element {
  return () => {
    const section = document.getElementById(id);
    if (!section) return document.body;
    for (const named of section.querySelectorAll("[data-tour='balance']")) {
      if (named instanceof HTMLElement && onScreen(named)) return named;
    }
    const header = section.querySelector("[data-eyebrow]")?.parentElement;
    if (header instanceof HTMLElement && header !== section) return header;
    const heading = section.querySelector("h2")?.parentElement;
    if (heading instanceof HTMLElement) return heading;
    return section;
  };
}

/** Builds and starts the walkthrough from whatever this layout renders. */
export async function startDashboardTour(t: Translate): Promise<void> {
  const steps: DriveStep[] = [];
  for (const def of STEP_DEFS) {
    const popover = {
      title: t(`${def.key}Title`),
      description: t(`${def.key}Body`),
      side: def.side,
      align: "center" as const,
    };
    if (def.section) {
      if (document.getElementById(def.section)) {
        steps.push({ element: sectionAnchor(def.section), popover });
      }
      continue;
    }
    if (def.chrome) {
      const element = findChrome(def.chrome);
      if (element) steps.push({ element, popover });
      continue;
    }
    steps.push({ popover });
  }
  if (steps.length < 2) return;

  // Loaded here, not at module scope. The caller has already checked that this
  // user has not seen the tour, so a returning visitor never pays for it: the
  // library and its stylesheet are ~380KB that only a first-time visitor needs.
  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);

  driver({
    showProgress: true,
    // Driver's own {{current}}/{{total}} placeholders, with only the word
    // between them translated: putting the braces through the i18n layer
    // would trip ICU parsing.
    progressText: `{{current}} ${t("progressOf")} {{total}}`,
    nextBtnText: t("next"),
    prevBtnText: t("back"),
    doneBtnText: t("done"),
    popoverClass: "ws-tour",
    overlayOpacity: 0.72,
    stagePadding: 8,
    stageRadius: 16,
    smoothScroll: true,
    disableActiveInteraction: true,
    // Closing early counts as seen: a tour that reopens on every visit until
    // finished is nagging, not helping.
    onDestroyed: () => markDashboardTourSeen(),
    steps,
  }).drive();
}

// Give the dashboard a moment to paint real content before pointing at it.
const START_DELAY_MS = 1400;

/**
 * Runs the walkthrough once, on the user's first dashboard visit, or when
 * the topbar's replay button requested it before routing here.
 */
export function useDashboardTour(): void {
  const t = useTranslations("tour");

  useEffect(() => {
    const replay = consumeTourReplay();
    if (!replay && hasSeenDashboardTour()) return;
    const id = window.setTimeout(() => void startDashboardTour(t), START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [t]);
}
