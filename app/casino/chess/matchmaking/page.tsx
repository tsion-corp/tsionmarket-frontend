"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { MatchmakingSection } from "@/components/dashboard/casino/chess/matchmaking-section";

function MatchmakingFromParams() {
  return <MatchmakingSection ticketId={useSearchParams().get("ticket")} />;
}

export default function ChessMatchmakingPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <MatchmakingFromParams />
      </Suspense>
    </CasinoPage>
  );
}
