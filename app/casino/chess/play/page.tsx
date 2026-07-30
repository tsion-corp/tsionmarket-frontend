"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { PlaySection } from "@/components/dashboard/casino/chess/play-section";

function PlayFromParams() {
  return <PlaySection matchId={useSearchParams().get("match")} />;
}

export default function ChessPlayPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <PlayFromParams />
      </Suspense>
    </CasinoPage>
  );
}
