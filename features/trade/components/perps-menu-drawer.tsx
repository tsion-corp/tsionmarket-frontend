"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar } from "@/components/layout/sidebar";
import { buildNav } from "@/components/layout/nav-items";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import { useInterest } from "@/hooks/use-interest";
import { sectionForPathname } from "@/lib/sections";

interface PerpsMenuDrawerProps {
  /** Owned by the route, which also makes the desk behind inert while it is true. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// What counts as a stop on the way round the drawer. Anything the browser
// would not focus anyway is filtered out at the call site.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getAttribute("aria-hidden") !== "true" && getComputedStyle(el).display !== "none"
  );
}

/**
 * The perps screen's way back into the rest of the app.
 *
 * Perps is immersive: it mounts no shell, so it has no rail and no topbar.
 * This is the hamburger that stands where the Portfolio back link used to,
 * plus the app's real Sidebar mounted on its own as an overlay. Not a second
 * drawer: the rail already behaves exactly this way as the phone drawer, so
 * it gets the same `open`/`onClose` pair here and brings its slide, its dimmed
 * backdrop, its scroll lock, its Escape handler and its close-on-choice with
 * it. The entries come from buildNav, so a section hidden from the rail
 * (Real assets today, via HIDDEN_NAV_SECTIONS) is hidden here too.
 *
 * The rail is written for two states, a phone drawer and a fixed desktop rail,
 * and pins itself open from `md` up. Perps wants the drawer at every width, so
 * the wrapper below re-points the four `md:` utilities that would otherwise
 * pin it: the sidebar's translate, its width and its z-index, and the
 * backdrop's and close button's display. Descendant selectors, so they win on
 * specificity without the rail needing to know this screen exists.
 */
export function PerpsMenuDrawer({ open, onOpenChange }: PerpsMenuDrawerProps) {
  const tSections = useTranslations("sections");
  const tTopbar = useTranslations("topbar");
  const interest = useInterest();
  const nav = useMemo(() => buildNav(interest, tSections), [interest, tSections]);
  const pathname = usePathname();
  // A route fact, the same one the shell derives for every other page, so the
  // rail opens with Perpetuals lit rather than a hardcoded guess.
  const activeSection = sectionForPathname(pathname);
  const navigate = useAppNavigate();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  // Only return focus to the hamburger after a close we actually opened, not
  // on the first render, which is closed and must not steal focus.
  const wasOpen = useRef(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (open) {
      wasOpen.current = true;
      if (drawer) focusableIn(drawer)[0]?.focus();
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  // Tab stays inside the drawer while it is open. Scoped to the wrapper rather
  // than the window: the desk behind is inert, so focus can only be in here,
  // and a listener on the window would also fight anything the rail opens.
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !open) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const stops = focusableIn(drawer);
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={tTopbar("menu")}
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => onOpenChange(!open)}
        className="mb-4 grid size-9 cursor-pointer place-items-center rounded-full border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Closed, the rail is parked off-canvas but still in the document, so
          `inert` takes it out of the tab order and off the accessibility tree
          until it is open. */}
      <div
        ref={drawerRef}
        inert={!open}
        onKeyDown={trapTab}
        className={`motion-reduce:[&>aside]:transition-none [&>aside]:md:z-[110] [&>aside]:md:w-[280px] [&>aside>div:first-child>button]:md:grid [&>div]:md:block ${
          open ? "[&>aside]:md:translate-x-0" : "[&>aside]:md:-translate-x-full"
        }`}
      >
        <Sidebar
          items={nav}
          activeSection={activeSection}
          onNavigate={(id) => navigate(id)}
          open={open}
          onClose={close}
        />
      </div>
    </>
  );
}
