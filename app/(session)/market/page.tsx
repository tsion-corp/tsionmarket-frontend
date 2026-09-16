"use client";

import { Suspense, useMemo } from "react";
import { useTranslations } from "next-intl";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { CurvedTabBar } from "@/components/layout/curved-tab-bar";
import { buildNav } from "@/components/layout/nav-items";
import { useInterest } from "@/hooks/use-interest";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import { MobileMarketView } from "@/features/trade/components/mobile-market-view";
import { RwaSection } from "@/features/rwa";

// The phone Market page (Figma 173:42337): a full-screen Spot trading view with
// its own MARKET head, standalone from the app shell. It lives in (session) —
// not (app) — so it gets the wallet providers without the topbar/sidebar/tab
// bar that the shell would otherwise wrap every product route in.
//
// Standalone, though, meant no bottom nav: the reader reached Market from the
// tab bar and then had no tab bar to leave it by. So this page carries that one
// piece of the shell itself — the curved bottom bar — wired to the same nav and
// the same navigate the shell uses. The Market icon reads active while here.
export default function MarketPage() {
  const modals = useAppModals();
  const tSections = useTranslations("sections");
  const interest = useInterest();
  const nav = useMemo(() => buildNav(interest, tSections), [interest, tSections]);
  const navigate = useAppNavigate();
  return (
    <AuthGuard>
      {/* Suspense boundary for the view's useSearchParams (it reads ?tab= to
          open on the right tab); without it the static prerender check fails. */}
      <Suspense fallback={null}>
        <MobileMarketView
          onOpenDetail={modals.openDetail}
          onOpenBuy={modals.openBuy}
          onAddFunds={modals.openFunds}
          rwaSlot={<RwaSection onAddFunds={modals.openFunds} />}
        />
      </Suspense>
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />

      {/* The bottom nav, so Market is not a one-way trip. The view reserves room
          for it (see the pb on its content column) so nothing hides behind it.
          Market is reached from the second icon, so it reads active here. */}
      <CurvedTabBar items={nav} activeSection="spot" onNavigate={navigate} />
    </AuthGuard>
  );
}
