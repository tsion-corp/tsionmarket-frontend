"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useTranslations } from "next-intl";
import { buildNav } from "@/components/dashboard/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import {
  CasinoNavGuardProvider,
  useCasinoNavGuard,
} from "@/components/dashboard/casino/casino-nav-guard";
import { loadInterest } from "@/lib/preferences";

// Names for the routes that are somewhere to go back to. Anything else falls
// back to its own last path segment.
const SECTION_LABEL: Record<string, string> = {
  "/casino": "Arkade",
  "/casino/chess": "Chess",
  "/casino/draw": "Draw",
  "/casino/last-standing": "The Last Man",
};

function titleCase(segment: string): string {
  const words = segment.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Back goes up one level rather than always to the hub, so a game returns to
// the chess lobby it was started from instead of jumping past it.
export function parentRoute(pathname: string): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return { href: "/casino", label: "Arkade" };
  const href = `/${parts.slice(0, -1).join("/")}`;
  return { href, label: SECTION_LABEL[href] ?? titleCase(parts[parts.length - 2]) };
}

function BackLink({ pathname }: { pathname: string }) {
  const guard = useCasinoNavGuard();
  const { href, label } = parentRoute(pathname);

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pt-5 sm:px-6 lg:px-8">
      <Link
        href={href}
        // The screen below may need to ask something first, e.g. a game that
        // can only be left by resigning it.
        onClick={(event) => {
          if (guard.blocked()) event.preventDefault();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <ChevronLeftIcon size={12} />
        {label}
      </Link>
    </div>
  );
}

// Chrome wrapper shared by every casino route: auth guard plus the app shell
// with the Casino tab active. Any screen below the hub also gets a back link,
// since the sidebar only points at the hub itself.
export function CasinoPage({ children }: { children: React.ReactNode }) {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const pathname = usePathname();
  const isHub = pathname === "/casino";

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="casino">
        <CasinoNavGuardProvider>
          {isHub || !pathname ? null : <BackLink pathname={pathname} />}
          {children}
        </CasinoNavGuardProvider>
      </DashboardShell>
    </AuthGuard>
  );
}
