"use client";

import { useRouter } from "next/navigation";
import { ArkadeDesktop, ArkadeMobile, CasinoPage } from "@/features/casino";
import { TRACKED_GAMES, type CasinoGame } from "@/features/casino/lib/games";
import { track } from "@/lib/analytics/mixpanel";

export default function CasinoHubPage() {
  const router = useRouter();

  // ArkadeDesktop is presentational, so opening a game is the route's job. The
  // hrefs come from the static catalogue, never from user input.
  //
  // The event fires here rather than in the tile. It used to ride on GameTile's
  // Link, and replacing the hub with ArkadeDesktop took the only desktop call
  // site with it, so game_opened silently stopped reporting on desktop. Firing
  // from the route keeps it tied to the navigation it describes.
  const openGame = (game: CasinoGame) => {
    if (!game.href) return;
    const tracked = TRACKED_GAMES[game.id];
    if (tracked) track("game_opened", { game: tracked });
    router.push(game.href);
  };

  return (
    <CasinoPage>
      {/* Phone gets the mobile hub; from md up the desktop grid stands. Both are
          cheap to mount (they share the portfolio query), so this branches with
          markup rather than a viewport hook. Exactly one catalogue renders at
          any width: ArkadeDesktop replaced HubSection here. */}
      <div className="md:hidden">
        <ArkadeMobile />
      </div>
      {/* The row is a three column grid, so this container's width is the card
          width. It fills the shell with the app's standard page padding, 16px,
          24px from sm, 32px from lg, and nothing else: the old 1200px cap was
          narrower than every other surface in the app and boxed the grid into
          a column with empty gutters on a wide monitor.

          The cap that replaces it is the perps terminal's 1920px, the widest
          container in the repo. It does not engage at any mainstream desktop
          width: with the 248px sidebar taken off, a 1920px viewport leaves
          1672px, so the grid runs edge to edge there and at 1440. It only
          bites past roughly 2200px, where three cards of the comp's fixed
          204px height would pass 3:1 and the artwork would crop to a strip. */}
      <div className="mx-auto hidden w-full max-w-[1920px] p-4 sm:p-6 md:block lg:p-8">
        {/* The catalogue is a static module constant, so there is nothing to
            wait on: `loading` stays at its false default rather than being
            wired to a query this route does not have. */}
        <ArkadeDesktop onSelectGame={openGame} />
      </div>
    </CasinoPage>
  );
}
