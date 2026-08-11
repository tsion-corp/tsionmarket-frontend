"use client";

import { CasinoPage, LastStandingSection } from "@/features/casino";
import { SellSheet } from "@/features/trade";

export default function LastStandingPage() {
  return (
    <CasinoPage>
      <LastStandingSection
        renderWithdrawSheet={(payload, onClose) => (
          <SellSheet payload={payload} onClose={onClose} />
        )}
      />
    </CasinoPage>
  );
}
