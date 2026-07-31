"use client";

import { use } from "react";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { SwissDetailSection } from "@/components/dashboard/casino/chess/swiss/detail-section";

export default function ChessSwissDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <CasinoPage>
      <SwissDetailSection tournamentId={id} />
    </CasinoPage>
  );
}
