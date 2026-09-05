"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { SpotSection } from "@/features/trade/components/spot-section";
import { loadInterest } from "@/lib/preferences";

// Spot as its own page, like Prediction and Arkade: the whole market list and
// the pro terminal, with the dashboard carrying only a brief of it.
export default function SpotPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const modals = useAppModals();

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="spot">
        <SpotSection onOpenDetail={modals.openDetail} onOpenBuy={modals.openBuy} />
      </DashboardShell>
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </AuthGuard>
  );
}
