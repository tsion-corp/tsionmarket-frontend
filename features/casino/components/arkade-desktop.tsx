"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CASINO_GAMES,
  filterGames,
  type CasinoGame,
  type GameCategoryFilter,
} from "@/features/casino/lib/games";
import { ArkadeDesktopRow } from "@/features/casino/components/arkade-desktop-row";

/**
 * Arkade on the desktop, as the comp draws it (frame 173:47085).
 *
 * The comp is two pieces: a four-tab filter bar over a sliding underline (node
 * 173:47128), and a stack of four identical card rails (node 173:47143). The
 * four rails carry no headings, no per-row arrows and no distinct content —
 * they are the same three-card strip repeated, which makes them a repeated row
 * component rather than four categories or four featured games. So the
 * catalogue is chunked into rails of three, one rail per chunk, and the tab bar
 * filters the whole stack.
 *
 * Presentational only: the catalogue comes in as a prop and opening a game goes
 * back out through `onSelectGame`.
 */

// Three 370px cards 13px apart overrun the comp's 1038px strip, which is what
// makes the third card peek and the rail scroll. Chunking at three reproduces
// that exactly.
const ROW_SIZE = 3;

// The desktop comp shows four filters where the phone shows seven. Racing, New
// and Coming soon are absent from it, and every game they would reach is still
// reachable under All, so this follows the comp rather than widening it.
const DESKTOP_CATEGORIES: readonly GameCategoryFilter[] = [
  "All games",
  "Skill",
  "Cards",
  "Draws",
] as const;

const CATEGORY_KEY: Record<string, string> = {
  "All games": "categoryAll",
  Skill: "categorySkill",
  Cards: "categoryCards",
  Draws: "categoryDraws",
};

function chunk(games: CasinoGame[], size: number): CasinoGame[][] {
  const rows: CasinoGame[][] = [];
  for (let i = 0; i < games.length; i += size) rows.push(games.slice(i, i + size));
  return rows;
}

export interface ArkadeDesktopProps {
  // The catalogue to lay out. Defaults to the shipped one, so a route can mount
  // the surface without threading static product structure through itself.
  games?: CasinoGame[];
  // Draws placeholder rails. The catalogue itself is static, but a route that
  // merges live data before rendering has something to show meanwhile.
  loading?: boolean;
  // Fired with the catalogue entry behind an activated tile.
  onSelectGame?: (game: CasinoGame) => void;
  // Which filter the surface opens on.
  defaultCategory?: GameCategoryFilter;
}

export function ArkadeDesktop({
  games = CASINO_GAMES,
  loading = false,
  onSelectGame,
  defaultCategory = "All games",
}: ArkadeDesktopProps) {
  const t = useTranslations("casino.hub");
  const [category, setCategory] = useState<GameCategoryFilter>(defaultCategory);

  const visible = useMemo(
    // Search belongs to the phone's field, which the desktop comp does not
    // draw, so the query stays empty and only the category narrows the list.
    () => filterGames(games, category, "", (game) => t(`games.${game.id}.name`)),
    [games, category, t]
  );

  // An empty result still gets one rail, so the empty treatment lands in the
  // same band a populated rail would fill instead of collapsing the layout.
  const rows = visible.length > 0 ? chunk(visible, ROW_SIZE) : [[]];
  const activeIndex = Math.max(0, DESKTOP_CATEGORIES.indexOf(category));

  return (
    <div className="w-full">
      <div role="group" aria-label={t("categoriesLabel")} className="w-[440px] max-w-full">
        <div className="flex items-center gap-[12px]">
          {DESKTOP_CATEGORIES.map((value) => {
            const active = value === category;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(value)}
                // Bold at 12px. The comp drew the filter labels in Quicksand;
                // production keeps its display face.
                className={`h-[38px] w-[101px] shrink-0 cursor-pointer rounded-full font-serif text-[12px] leading-4 font-bold whitespace-nowrap transition-colors ${
                  active ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {t(CATEGORY_KEY[value])}
              </button>
            );
          })}
        </div>

        {/* The comp's underline: a 3px track under the whole bar with a white
            segment exactly a quarter of it wide, sitting under the active tab. */}
        <div aria-hidden className="relative mt-0.5 h-[3px] w-full rounded-[2.4px] bg-white/8">
          <div
            className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-white transition-transform duration-200"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-[14px]">
        {rows.map((row, index) => (
          <ArkadeDesktopRow
            key={row[0]?.id ?? `row-${index}`}
            games={row}
            loading={loading}
            label={t("rowLabel", { index: index + 1 })}
            onSelectGame={onSelectGame}
          />
        ))}
      </div>
    </div>
  );
}
