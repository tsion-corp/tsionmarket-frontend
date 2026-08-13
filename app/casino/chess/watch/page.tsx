"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChessRoundPageShell, SpectateSection } from "@/features/casino";

function WatchFromParams() {
  return <SpectateSection matchId={useSearchParams()?.get("match") ?? null} />;
}

export default function ChessWatchPage() {
  return (
    <ChessRoundPageShell>
      <Suspense fallback={null}>
        <WatchFromParams />
      </Suspense>
    </ChessRoundPageShell>
  );
}
