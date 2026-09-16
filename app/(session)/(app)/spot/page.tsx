"use client";

import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { SpotDesktopView } from "@/features/trade/components/spot-desktop-view";
import { useMarketHandoff } from "@/hooks/use-market-handoff";

// Spot as its own page, like Prediction and Arkade: the 2.0 desk, with the
// market list and the order ticket side by side. It is the md-and-up half of a
// pair; below md the Spot surface is the phone Market page's Spot tab, so this
// hands off to it (see useMarketHandoff) rather than drawing a phone layout of
// its own.
//
// The desk hands its Sell up to the modal host here: selling needs the origin
// network, the gas check and the exact held balance, all of which the existing
// sell sheet already knows how to ask for.
//
// The auth guard and the app shell come from the (app) layout.
export default function SpotPage() {
  const modals = useAppModals();
  const handingOff = useMarketHandoff("spot");

  // Below md this hands off to /market; render nothing meanwhile so the desk is
  // never painted at phone width before the redirect lands.
  if (handingOff) return null;

  return (
    <>
      <SpotDesktopView onAddFunds={modals.openFunds} />
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </>
  );
}
