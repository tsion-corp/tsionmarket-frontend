"use client";

import { use, useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { EventDetail } from "@/features/prediction";
import { loadInterest } from "@/lib/preferences";

// One multi-outcome EVENT (Polymarket-style grouped market): the candidate/
// outcome list, context + rules, and event comments. `id` is the group id or
// slug. Same app shell as the browse page, Prediction tab active.
export default function PredictionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="prediction">
        <EventDetail idOrSlug={id} />
      </DashboardShell>
    </AuthGuard>
  );
}
