"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { SwissDetailSection } from "@/features/casino/components/chess/swiss/detail-section";

// The standings, pairings and round controls are game-agnostic; a draughts
// pairing simply opens its board on the checkers surface.
export default function CheckersTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const created = useSearchParams().get("created") === "1";
  return (
    <CasinoPage>
      <SwissDetailSection tournamentId={id} showCreatedShare={created} />
    </CasinoPage>
  );
}
