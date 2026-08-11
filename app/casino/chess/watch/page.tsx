"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage, SpectateSection } from "@/features/casino";

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
