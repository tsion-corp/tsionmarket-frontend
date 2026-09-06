"use client";

import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { RwaSection } from "@/features/rwa";
import { RwaSettlementTracker } from "@/features/rwa/components/rwa-settlement-tracker";

// Real-world assets as their own page again, now with the full section rather
// than the redirect to the dashboard anchor it used to be. The section owns its
// detail and trade sheets; the modal host is here for "Add funds", which it
// hands upward. The auth guard and the app shell come from the (app) layout.
export default function RwaPage() {
  const modals = useAppModals();

  return (
    <>
      {/* Follows a settling trade to completion, so leaving the dashboard
          does not lose the report. */}
      <RwaSettlementTracker />
      <RwaSection
        onOpenDetail={modals.openDetail}
        onOpenConfirm={modals.openConfirm}
        onAddFunds={modals.openFunds}
      />
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </>
  );
}
