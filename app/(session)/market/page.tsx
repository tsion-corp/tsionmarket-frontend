"use client";

import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { MobileMarketView } from "@/features/trade/components/mobile-market-view";
import { PredictionMarketList } from "@/features/prediction";
import { RwaSection } from "@/features/rwa";

// The phone Market page (Figma 173:42337): a full-screen Spot trading view with
// its own MARKET head, standalone from the app shell. It lives in (session) —
// not (app) — so it gets the wallet providers without the topbar/sidebar/tab
// bar that the shell would otherwise wrap every product route in.
export default function MarketPage() {
  const modals = useAppModals();
  return (
    <AuthGuard>
      {/* Suspense boundary for the view's useSearchParams (it reads ?tab= to
          open on the right tab); without it the static prerender check fails. */}
      <Suspense fallback={null}>
        <MobileMarketView
          onOpenDetail={modals.openDetail}
          onOpenBuy={modals.openBuy}
          predictionSlot={<PredictionMarketList />}
          rwaSlot={(query) => (
            <RwaSection
              phone
              query={query}
              onOpenDetail={modals.openDetail}
              onOpenConfirm={modals.openConfirm}
              onAddFunds={modals.openFunds}
            />
          )}
        />
      </Suspense>
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </AuthGuard>
  );
}
