"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage, ChessRoundPageShell, LichessRound, LiveGamesSection } from "@/features/casino";

function WatchFromParams() {
  const matchId = useSearchParams()?.get("match") ?? null;
  if (!matchId) {
    return (
      <CasinoPage hideBackLink>
        <LiveGamesSection />
      </CasinoPage>
    );
  }
  return (
    <ChessRoundPageShell>
      <LichessRound matchId={matchId} seatName={null} forceSpectator />
    </ChessRoundPageShell>
  );
}

export default function ChessWatchPage() {
  return (
    <Suspense fallback={null}>
      <WatchFromParams />
    </Suspense>
  );
}
