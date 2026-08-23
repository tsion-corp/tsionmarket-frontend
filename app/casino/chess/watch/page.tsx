"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  CasinoPage,
  ChessRoundPageShell,
  LiveGamesSection,
  SpectateSection,
} from "@/features/casino";

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
      <SpectateSection matchId={matchId} />
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
