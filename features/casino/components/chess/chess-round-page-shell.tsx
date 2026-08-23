"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { CasinoNavGuardProvider } from "@/features/casino/components/casino-nav-guard";
import { ChessSiteShell } from "@/features/casino/components/chess/chess-site-shell";

export function ChessRoundPageShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <CasinoNavGuardProvider>
        <ChessSiteShell compact fixedViewport>
          <div className="min-h-0 pt-2 sm:pt-3 xl:h-full xl:overflow-hidden xl:pt-4">
            {children}
          </div>
        </ChessSiteShell>
      </CasinoNavGuardProvider>
    </AuthGuard>
  );
}
