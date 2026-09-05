"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { RwaSection } from "@/features/rwa";
import { RwaSettlementTracker } from "@/features/rwa/components/rwa-settlement-tracker";
import { loadInterest } from "@/lib/preferences";

// Real-world assets as their own page again, now with the full section rather
// than the redirect to the dashboard anchor it used to be. The section owns its
// detail and trade sheets; the modal host is here for "Add funds", which it
// hands upward.
export default function RwaPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const modals = useAppModals();

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="rwa">
        {/* Follows a settling trade to completion, so leaving the dashboard
            does not lose the report. */}
        <RwaSettlementTracker />
        <RwaSection
          onOpenDetail={modals.openDetail}
          onOpenConfirm={modals.openConfirm}
          onAddFunds={modals.openFunds}
        />
      </DashboardShell>
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </AuthGuard>
  );
}
