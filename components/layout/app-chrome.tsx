"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildNav, type NavItem } from "@/components/layout/nav-items";
import { loadInterest } from "@/lib/preferences";
import { sectionForPathname, type SectionId } from "@/lib/sections";

interface AppChrome {
  /** The rail's entries, in the order the user's onboarding interest set. */
  nav: NavItem[];
  /** The entry the rail highlights. */
  activeSection: SectionId;
  /** For a page whose highlight is not a route fact. See useReportActiveSection. */
  reportActiveSection: (id: SectionId | null) => void;
}

const AppChromeContext = createContext<AppChrome | null>(null);

/**
 * What the app shell needs to draw itself, held once above every signed-in
 * route rather than rebuilt by each page.
 *
 * Before the shared layout, every page computed the nav and passed the shell
 * a hard-coded active section. That worked while each page mounted its own
 * shell; a shell mounted once by the layout cannot take those as props from
 * the page below it. The active section is a route fact for every page but
 * the dashboard, so it is derived from the path here, and the dashboard
 * reports its scroll-spy position as an override while it is mounted.
 */
export function AppChromeProvider({ children }: { children: React.ReactNode }) {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const pathname = usePathname();
  const [override, setOverride] = useState<SectionId | null>(null);
  const activeSection = override ?? sectionForPathname(pathname);

  const value = useMemo<AppChrome>(
    () => ({ nav, activeSection, reportActiveSection: setOverride }),
    [nav, activeSection]
  );

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

export function useAppChrome(): AppChrome {
  const chrome = useContext(AppChromeContext);
  if (!chrome) throw new Error("useAppChrome must be used inside AppChromeProvider");
  return chrome;
}

/**
 * Lets a page drive the rail's highlight while it is mounted. The dashboard
 * uses it for its scroll-spy: which section is under the header is scroll
 * state, not something the path can say. Cleared on unmount, so the next
 * route derives its own highlight from its path.
 */
export function useReportActiveSection(id: SectionId): void {
  const { reportActiveSection } = useAppChrome();
  useEffect(() => {
    reportActiveSection(id);
    return () => reportActiveSection(null);
  }, [id, reportActiveSection]);
}
