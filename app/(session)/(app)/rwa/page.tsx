"use client";

import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { useMarketHandoff } from "@/hooks/use-market-handoff";
import { RwaDeskView, RwaSettlementTracker } from "@/features/rwa";

// Real-world assets as their own page, now on the 2.0 desk: the asset list on
// the left, the order ticket on the right, the same shape the spot desk has.
// The modal host is here for "Add funds", which the ticket hands upward. The
// auth guard and the app shell come from the (app) layout.
export default function RwaPage() {
  const modals = useAppModals();
  const handingOff = useMarketHandoff("rwa");

  // Below md this hands off to the phone Market page's Real assets tab; render
  // nothing meanwhile so the desk is never painted at phone width first.
  if (handingOff) return null;

  return (
    <>
      {/* Follows a settling trade to completion. It sits at page scope rather
          than inside the ticket on purpose: a closed ticket must not be able to
          strand funds mid-settlement. */}
      <RwaSettlementTracker />
      <RwaDeskView onAddFunds={modals.openFunds} />
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </>
  );
}
