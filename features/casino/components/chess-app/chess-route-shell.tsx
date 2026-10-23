"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { CasinoDashboardShell } from "@/features/casino/components/casino-page";
import { ChessHeaderActions } from "@/features/casino/components/chess-app/chess-profile-balance";
import { ChessStyleBoundary } from "@/features/casino/components/chess-app/chess-style-boundary";

function isChessHome(pathname: string | null): boolean {
  return pathname === "/casino/chess" || pathname === "/casino/chess/";
}

export function ChessRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
