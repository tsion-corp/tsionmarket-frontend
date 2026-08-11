"use client";

import { use, useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MarketDetail } from "@/features/prediction";
import { loadInterest } from "@/lib/preferences";

// One prediction market: chart, trade tape, execution and liquidity panels. The
// same app shell as the browse page, with the Prediction tab active.
export default function PredictionMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="prediction">
        <MarketDetail id={id} />
      </DashboardShell>
    </AuthGuard>
  );
}
