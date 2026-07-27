"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { VaultSection } from "@/components/dashboard/sections/vault-section";
import { buildNav } from "@/components/dashboard/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { loadInterest } from "@/lib/preferences";

export default function VaultPage() {
  const nav = useMemo(() => buildNav(loadInterest()), []);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="vault">
        <VaultSection />
      </DashboardShell>
    </AuthGuard>
  );
}
