"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ActivityView } from "@/features/activity";
import { useGameActivity } from "@/features/casino/hooks/use-game-activity";
import { loadInterest } from "@/lib/preferences";

// The route is the composition point: it pulls the off-chain arcade plays from
// the casino feature and hands them to the activity view, which merges them with
// the on-chain feed (features never import each other). This lives in its own
// component, INSIDE the shell, so a game-activity poll re-renders the list only,
// never the surrounding DashboardShell (nav, marquee, topbar).
function ArkivityContent() {
  const games = useGameActivity();
  return <ActivityView gameEntries={games.items} />;
}

// Transaction history as its own page, like Earn and Prediction.
export default function ActivityPage() {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="activity">
        <ArkivityContent />
      </DashboardShell>
    </AuthGuard>
  );
}
