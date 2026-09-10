"use client";

import dynamic from "next/dynamic";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { LastStandingLobby } from "@/features/casino/components/last-standing/last-standing-lobby";

const SellSheet = dynamic(
  () => import("@/features/trade/components/sell-sheet").then((module) => module.SellSheet),
  { ssr: false }
);

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
