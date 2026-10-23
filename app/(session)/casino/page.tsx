"use client";

import { useRouter } from "next/navigation";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { ArkadeDesktop } from "@/features/casino/components/arkade-desktop";
import { ArkadeMobile } from "@/features/casino/components/arkade-mobile";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { type CasinoGame } from "@/features/casino/lib/games";
import { useCasinoPresence } from "@/features/casino/hooks/use-casino-presence";

export default function CasinoHubPage() {
  const router = useRouter();
  const modals = useAppModals();
  const presence = useCasinoPresence();

  // ArkadeDesktop is presentational, so opening a game is the route's job. The
  // hrefs come from the static catalogue, never from user input.
  const openGame = (game: CasinoGame) => {
    if (!game.href) return;
    router.push(game.href);
  };

  return (
    <CasinoPage>
      {/* Phone gets the mobile hub; from md up the desktop grid stands. Both are
          cheap to mount (they share the portfolio query), so this branches with
          markup rather than a viewport hook. Exactly one catalogue renders at
          any width: ArkadeDesktop replaced HubSection here. */}
      <div className="md:hidden">
        <ArkadeMobile
          onSelectGame={openGame}
          onAddFunds={modals.openFunds}
          presenceByGame={presence.data}
        />
      </div>
      {/* Arkade follows the portfolio flow: the same centred column the rest of
          the app uses — mx-auto, max-w-[1520px], and the standard page padding
          (16px, 24px from sm, 32px from lg). Matching portfolio keeps the two
          surfaces on one edge instead of Arkade running wider on a big monitor. */}
      <div className="mx-auto hidden w-full max-w-[1520px] p-4 sm:p-6 md:block lg:p-8">
        {/* The catalogue is a static module constant, so there is nothing to
            wait on: `loading` stays at its false default rather than being
            wired to a query this route does not have. */}
        <ArkadeDesktop
          onSelectGame={openGame}
          onAddFunds={modals.openFunds}
          presenceByGame={presence.data}
        />
      </div>
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </CasinoPage>
  );
}
