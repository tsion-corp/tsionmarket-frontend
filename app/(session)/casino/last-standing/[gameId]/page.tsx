"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { use } from "react";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { LastStandingSection } from "@/features/casino/components/last-standing/last-standing-section";

const SellSheet = dynamic(
  () => import("@/features/trade/components/sell-sheet").then((module) => module.SellSheet),
  { ssr: false }
);

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
