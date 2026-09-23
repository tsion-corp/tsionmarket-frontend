"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics/mixpanel";
import { chessModeForRoute } from "@/features/casino/lib/chess-mode";
import type { ChessMode } from "@/lib/analytics/events";
import { CasinoDashboardShell } from "@/features/casino/components/casino-page";
import { ChessHeaderActions } from "@/features/casino/components/chess-app/chess-profile-balance";
import { ChessStyleBoundary } from "@/features/casino/components/chess-app/chess-style-boundary";

function isChessHome(pathname: string | null): boolean {
  return pathname === "/casino/chess" || pathname === "/casino/chess/";
}

export function ChessRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Which way into chess the player took. Reported when the mode changes, not
  // on every render, so returning to the lobby and picking the same mode again
  // is one pick and a re-render is none. Above the branch below: a hook cannot
  // be called behind one.
  const mode = chessModeForRoute(pathname ?? "", searchParams.toString());
  const lastMode = useRef<ChessMode | null>(null);
  useEffect(() => {
    if (!mode || lastMode.current === mode) {
      if (!mode) lastMode.current = null;
      return;
    }
    lastMode.current = mode;
    track("chess_mode_selected", { mode });
  }, [mode]);

  if (isChessHome(pathname)) {
    const setupOpen = searchParams.has("setup");

    return (
      <>
        <CasinoDashboardShell>{children}</CasinoDashboardShell>
        {setupOpen ? <span hidden data-chess-setup-open /> : <ChessHeaderActions />}
      </>
    );
  }

  return (
    <>
      <ChessStyleBoundary />
      {children}
    </>
  );
}
