"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MemeSection } from "@/features/trade/components/meme-section";
import { loadInterest } from "@/lib/preferences";

// Memecoins as their own page. The section trades through its own sheet, so
// this route needs no modal host.
export default function MemePage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="meme">
        <MemeSection />
      </DashboardShell>
    </AuthGuard>
  );
}
