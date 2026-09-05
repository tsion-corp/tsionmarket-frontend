"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { PerpsSection } from "@/features/trade/components/perps-section";
import { loadInterest } from "@/lib/preferences";

// Perpetuals as its own page. The perps desk owns its order ticket and its
// own sheets, so this route needs no modal host.
export default function PerpsPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="perps">
        <PerpsSection />
      </DashboardShell>
    </AuthGuard>
  );
}
