"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { CasinoPage, LastStandingSection } from "@/features/casino";
import { SellSheet } from "@/features/trade";

// One game, and the link players share. The id is validated here rather than
// inside the section so a hand-typed path fails at the route instead of
// requesting game NaN.
export default function LastStandingGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  if (!/^\d+$/.test(gameId)) notFound();

  return (
    <CasinoPage>
      <LastStandingSection
        gameId={Number(gameId)}
        renderWithdrawSheet={(payload, onClose) => (
          <SellSheet payload={payload} onClose={onClose} />
        )}
      />
    </CasinoPage>
  );
}
