"use client";

import { useTranslations } from "next-intl";
import type { CasinoGame } from "@/features/casino/lib/games";
import { ARKADE_CARD_FRAME, ArkadeGameCard } from "@/features/casino/components/arkade-game-card";

/**
 * One row of the desktop Arkade catalogue (node 173:47144): three game cards
 * side by side, 13px apart, each 203.8px tall at the 20px corner.
 *
 * The comp draws each card 370px wide inside a 1038px strip, which does not
 * fit: 3x370 plus two gaps is 1136px, so the comp's own third card is sliced
 * vertically with half a Play button. That is a file defect, not a spec, so the
 * width is not transcribed. The row is a three-column grid that divides
 * whatever container it is given, which keeps the comp's rhythm and card height
 * while never slicing a card at any width. See the report for the ruling this
 * needs.
 *
 * The card itself is ArkadeGameCard, the same one the phone list draws. This
 * file owns the rail: how many cards, how they are spaced, and what an empty or
 * loading rail looks like.
 *
 * Presentational only. Games arrive as props, and opening one is the caller's
 * job through `onSelectGame`.
 */

// How many placeholder cards a loading row draws. Three fills the row, so the
// skeleton occupies the same band the real cards will.
const SKELETON_COUNT = 3;

export interface ArkadeDesktopRowProps {
  // The games this row shows, already filtered and ordered by the caller.
  games: CasinoGame[];
  // Accessible name for the row, since the comp gives it no visible title.
  label: string;
  // Fired with the whole catalogue entry when a playable tile is activated.
  // Navigation belongs to the route, not to a presentational row.
  onSelectGame?: (game: CasinoGame) => void;
  // Draws placeholder cards instead of tiles or the empty treatment.
  loading?: boolean;
}

export function ArkadeDesktopRow({ games, label, onSelectGame, loading }: ArkadeDesktopRowProps) {
  const t = useTranslations("casino.hub");

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("loadingGames")}
        className="grid grid-cols-3 gap-[13px]"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className={`${ARKADE_CARD_FRAME} bg-surface animate-pulse`} />
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div
        className="border-hairline text-grey-400 rounded-card flex h-[204px] items-center justify-center border border-dashed font-serif text-[14px]"
        // The row keeps its name while empty, so the reason sits under the
        // same heading a populated row would have.
        aria-label={label}
      >
        {t("emptyCategory")}
      </div>
    );
  }

  return (
    <ul
      aria-label={label}
      // Three equal columns of the container, so a short last row keeps the
      // same card width as a full one instead of stretching to fill.
      className="grid list-none grid-cols-3 gap-[13px]"
    >
      {games.map((game) => (
        <li key={game.id} className="min-w-0">
          <ArkadeGameCard game={game} surface="desktop" onActivate={onSelectGame} />
        </li>
      ))}
    </ul>
  );
}
