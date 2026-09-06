"use client";

import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { SpotSection } from "@/features/trade/components/spot-section";

// Spot as its own page, like Prediction and Arkade: the whole market list and
// the pro terminal, with the dashboard carrying only a brief of it. The auth
// guard and the app shell come from the (app) layout.
export default function SpotPage() {
  const modals = useAppModals();

  return (
    <>
      <SpotSection onOpenDetail={modals.openDetail} onOpenBuy={modals.openBuy} />
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </>
  );
}
