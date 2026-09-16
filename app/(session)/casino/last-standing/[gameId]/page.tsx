"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { LastStandingSection } from "@/features/casino/components/last-standing/last-standing-section";

// One game, and the link players share. The id is validated here rather than
// inside the section so a hand-typed path fails at the route instead of
// requesting game NaN.
export default function LastStandingGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  if (!/^\d+$/.test(gameId)) notFound();

  return (
    <CasinoPage>
      <LastStandingSection gameId={Number(gameId)} />
    </CasinoPage>
  );
}
