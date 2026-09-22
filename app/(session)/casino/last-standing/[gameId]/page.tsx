"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { LastStandingSection } from "@/features/casino/components/last-standing/last-standing-section";

// One game, and the link players share. The id is validated here rather than
// inside the section so a hand-typed path fails at the route instead of
// requesting game NaN.
export default function LastStandingGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const modals = useAppModals();
  if (!/^\d+$/.test(gameId)) notFound();

  return (
    <CasinoPage>
      {/* A player short of the entry needs somewhere to go, not a toast: the
          deposit flow is hosted here so the game can open it in place. */}
      <LastStandingSection gameId={Number(gameId)} onAddFunds={modals.openFunds} />
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </CasinoPage>
  );
}
