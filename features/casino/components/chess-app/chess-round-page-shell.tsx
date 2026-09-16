"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { CasinoNavGuardProvider } from "@/features/casino/components/casino-nav-guard";
import { ChessSiteShell } from "@/features/casino/components/chess-app/chess-site-shell";

export function ChessRoundPageShell({
  children,
  fixedViewport = true,
}: {
  children: React.ReactNode;
  fixedViewport?: boolean;
}) {
  return (
    <AuthGuard>
      <CasinoNavGuardProvider>
        <ChessSiteShell compact fixedViewport={fixedViewport}>
          <div
            className={
              fixedViewport
                ? "min-h-0 pt-2 sm:pt-3 xl:h-full xl:overflow-hidden xl:pt-4"
                : "min-h-0 pt-2 pb-16 sm:pt-3 xl:pt-4"
            }
          >
            {children}
          </div>
        </ChessSiteShell>
      </CasinoNavGuardProvider>
    </AuthGuard>
  );
}
