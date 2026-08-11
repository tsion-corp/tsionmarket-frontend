"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage, MatchmakingSection } from "@/features/casino";

function MatchmakingFromParams() {
  return <MatchmakingSection ticketId={useSearchParams()?.get("ticket") ?? null} />;
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
