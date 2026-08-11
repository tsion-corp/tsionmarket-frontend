"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { PredictionView } from "@/features/prediction";
import { loadInterest } from "@/lib/preferences";

// Prediction markets as their own page, like Earn and Casino: the same app
// shell with the Prediction tab active, the whole view as the body.
export default function PredictionPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="prediction">
        <PredictionView />
      </DashboardShell>
    </AuthGuard>
  );
}
