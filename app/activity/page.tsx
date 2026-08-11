"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ActivityView } from "@/features/activity";
import { loadInterest } from "@/lib/preferences";

// Transaction history as its own page, like Earn and Prediction.
export default function ActivityPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="activity">
        <ActivityView />
      </DashboardShell>
    </AuthGuard>
  );
}
