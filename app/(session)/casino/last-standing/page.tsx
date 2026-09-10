"use client";

import { CasinoPage, LastStandingLobby } from "@/features/casino";
import { SellSheet } from "@/features/trade";

// v4 runs many games at once, so the section lands on the lobby. A game itself
// lives at /casino/last-standing/[gameId], which is also the shareable link.
export default function LastStandingPage() {
  return (
    <CasinoPage>
      <LastStandingLobby
        renderWithdrawSheet={(payload, onClose) => (
          <SellSheet payload={payload} onClose={onClose} />
        )}
      />
    </CasinoPage>
  );
}
