"use client";

import { CasinoPage, LastStandingLobby } from "@/features/casino";

// v4 runs many games at once, so the section lands on the lobby. A game itself
// lives at /casino/last-standing/[gameId], which is also the shareable link.
export default function LastStandingPage() {
  return (
    <CasinoPage>
      <LastStandingLobby />
    </CasinoPage>
  );
}
