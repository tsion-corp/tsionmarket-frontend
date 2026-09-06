"use client";

import { CasinoPage } from "@/features/casino/components/casino-page";
import { CheckersLobby } from "@/features/casino/components/draughts/checkers-lobby";

// Setting up a game: time control, stake, then the invite link to share.
export default function CheckersCreatePage() {
  return (
    <CasinoPage hideBackLink>
      <CheckersLobby />
    </CasinoPage>
  );
}
