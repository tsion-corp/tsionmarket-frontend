"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { SpectateSection } from "@/components/dashboard/casino/chess/spectate-section";

function WatchFromParams() {
  return <SpectateSection matchId={useSearchParams()?.get("match") ?? null} />;
}

export default function ChessWatchPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <WatchFromParams />
      </Suspense>
    </CasinoPage>
  );
}
