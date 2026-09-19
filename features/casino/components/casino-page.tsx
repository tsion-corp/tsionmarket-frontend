"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useTranslations } from "next-intl";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import {
  CasinoNavGuardProvider,
  useCasinoNavGuard,
} from "@/features/casino/components/casino-nav-guard";
import { useInterest } from "@/hooks/use-interest";
import { DraughtsSiteHeader } from "@/features/casino/components/draughts/draughts-site-header";
import { ChessSiteShell } from "@/features/casino/components/chess-app/chess-site-shell";

// Names for the routes that are somewhere to go back to. Anything else falls
// back to its own last path segment.
const SECTION_LABEL: Record<string, string> = {
  "/casino": "Arkade",
  "/casino/chess": "Chess",
  "/casino/last-standing": "The Last Man",
  "/casino/arkball": "ArkBall",
  "/casino/arkjet": "Arkjet",
  "/casino/chicken": "Pilot Chicken",
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

function BackLink({ pathname, actions }: { pathname: string; actions?: React.ReactNode }) {
  const guard = useCasinoNavGuard();
  const { href, label } = parentRoute(pathname);

  return (
    <div
      className="mx-auto flex w-full max-w-[1520px] items-center justify-between gap-2 px-4 pt-5 sm:px-6 lg:px-8"
      data-casino-back-row
    >
      <Link
        href={href}
        // The screen below may need to ask something first, e.g. a game that
        // can only be left by resigning it.
        onClick={(event) => {
          if (guard.blocked()) event.preventDefault();
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <ChevronLeftIcon size={12} />
        {label}
      </Link>
      {actions ? (
        <div className="min-w-0" data-casino-back-actions>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

// The product chrome used by Arkade pages that remain part of the main app.
// Exporting the wrapper lets route layouts such as Chess reuse the exact same
// desktop sidebar and mobile navigation as Last Man without duplicating them.
export function CasinoDashboardShell({ children }: { children: React.ReactNode }) {
  const tSections = useTranslations("sections");
  const interest = useInterest();
  const nav = useMemo(() => buildNav(interest, tSections), [interest, tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="casino">
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}

// Chrome wrapper shared by every casino route: auth guard plus the app shell
// with the Casino tab active. Any screen below the hub also gets a back link,
// since the sidebar only points at the hub itself.
export function CasinoPage({
  children,
  hideBackLink,
  immersive,
  backActions,
}: {
  children: React.ReactNode;
  // The chess lobby pins its layout to the viewport and the sidebar already
  // points at Arkade, so the back link there is dead height.
  hideBackLink?: boolean;
  // Live board screens need the full viewport. Keeping this opt-in prevents a
  // game from inheriting the portfolio rail and search header while every
  // other Arkade route keeps the normal product shell.
  immersive?: boolean;
  backActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHub = pathname === "/casino";
  const isDraughts = pathname?.startsWith("/casino/checkers") ?? false;
  const isChess = pathname?.startsWith("/casino/chess") ?? false;

  if (isChess) {
    return (
      <AuthGuard>
        <CasinoNavGuardProvider>
          <ChessSiteShell>{children}</ChessSiteShell>
        </CasinoNavGuardProvider>
      </AuthGuard>
    );
  }

  if (immersive || isDraughts) {
    return (
      <AuthGuard>
        <CasinoNavGuardProvider>
          <div className="min-h-screen bg-[#0b0b0c] text-white">
            {isDraughts ? <DraughtsSiteHeader /> : null}
            {children}
          </div>
        </CasinoNavGuardProvider>
      </AuthGuard>
    );
  }

  return (
    <CasinoDashboardShell>
      <CasinoNavGuardProvider>
        {isHub || hideBackLink || !pathname ? null : (
          <BackLink pathname={pathname} actions={backActions} />
        )}
        {children}
      </CasinoNavGuardProvider>
    </CasinoDashboardShell>
  );
}
