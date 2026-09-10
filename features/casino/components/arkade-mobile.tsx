"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/ui/icons";
import { track } from "@/lib/analytics/mixpanel";
import {
  CASINO_GAMES,
  GAME_CATEGORIES,
  TRACKED_GAMES,
  filterGames,
  type CasinoGame,
  type GameCategoryFilter,
} from "@/features/casino/lib/games";
import { ARKADE_CARD_FRAME, ArkadeGameCard } from "@/features/casino/components/arkade-game-card";

/**
 * Arkade on a phone, as the comp draws it (node 12:204, 402x1076): a pill
 * search field, an underlined category strip that scrolls sideways, and the
 * catalogue as one full-width card per row.
 *
 * From `md` up the desktop grid takes over, so this renders phone-only. The
 * card itself is ArkadeGameCard, the same one the desktop rail draws; only the
 * footprint changes, from a third of a row to the whole width. This file owns
 * the list: the search field, the category strip, and what an empty or loading
 * list looks like.
 */

// Catalogue filter values mapped to their label keys in "casino.hub". The phone
// carries all seven where the desktop comp draws four, so this map is wider
// than the desktop's rather than the same one.
const CATEGORY_KEY: Record<GameCategoryFilter, string> = {
  "All games": "categoryAll",
  Skill: "categorySkill",
  Cards: "categoryCards",
  Draws: "categoryDraws",
  Racing: "categoryRacing",
  New: "categoryNew",
  "Coming soon": "categoryComingSoon",
};

// Tab metrics measured off the comp: a 101px tab every 113px, the same rhythm
// the desktop bar uses. Seven of them overrun the 402px frame, which is what
// makes the strip scroll and the fourth tab sit half off the right edge there.
const TAB_WIDTH = 101;
const TAB_PITCH = 113;
const STRIP_WIDTH = GAME_CATEGORIES.length * TAB_PITCH - (TAB_PITCH - TAB_WIDTH);

// How many placeholder cards a loading list draws. Three is what the comp shows
// above the fold, so the skeleton fills the same band the real cards will.
const SKELETON_COUNT = 3;

// The phone navigates with a real anchor rather than a router push, so the
// analytics call rides on the card's own click here. The desktop route fires
// the same event for its tiles; both read the id out of the one map in the
// catalogue, so neither can invent one and neither can go missing when the
// surface around it is replaced.
function reportGameOpened(game: CasinoGame) {
  const id = TRACKED_GAMES[game.id];
  if (id) track("game_opened", { game: id });
}

export interface ArkadeMobileProps {
  // The catalogue to lay out. Defaults to the shipped one, so a route can mount
  // the surface without threading static product structure through itself.
  games?: CasinoGame[];
  // Draws placeholder cards. The catalogue is static, but a caller that merges
  // live data before rendering has something to show meanwhile.
  loading?: boolean;
  // Which filter the surface opens on.
  defaultCategory?: GameCategoryFilter;
}

export function ArkadeMobile({
  games = CASINO_GAMES,
  loading = false,
  defaultCategory = "All games",
}: ArkadeMobileProps = {}) {
  const t = useTranslations("casino.hub");
  const [category, setCategory] = useState<GameCategoryFilter>(defaultCategory);
  const [search, setSearch] = useState("");

  // Search matches the names the player actually sees, i.e. the localized ones.
  const visible = useMemo(
    () => filterGames(games, category, search, (game) => t(`games.${game.id}.name`)),
    [games, category, search, t]
  );

  const activeIndex = Math.max(0, GAME_CATEGORIES.indexOf(category));

  return (
    // 20px at the edges, which is where the comp puts the search field and the
    // tab strip. The card list pulls back to 16px below, which is where the
    // comp puts the cards.
    <div className="w-full px-5 pt-6 pb-8">
      {/* The comp carries the ARKADE wordmark in the header band above this
          surface, not in the content, so the heading is here for the document
          outline only. */}
      <h1 className="sr-only">{t("title")}</h1>

      <label className="ws-inset flex h-[52px] items-center gap-2.5 rounded-full px-4">
        <SearchIcon size={16} className="shrink-0 text-white/40" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="w-full min-w-0 bg-transparent font-sans text-[14px] text-white outline-none placeholder:text-white/40 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      {/* Full bleed so the strip can run past the right edge the way the comp
          shows it, with the 20px lead-in kept as padding. */}
      <div className="ws-no-scrollbar -mx-5 mt-2 overflow-x-auto px-5">
        <div role="group" aria-label={t("categoriesLabel")} style={{ width: STRIP_WIDTH }}>
          <div className="flex" style={{ gap: TAB_PITCH - TAB_WIDTH }}>
            {GAME_CATEGORIES.map((value) => {
              const active = value === category;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(value)}
                  // 44px tall for the tap target. The comp's label sits at the
                  // top of that box, which is why the underline reads tight
                  // under the text rather than 14px below it.
                  className={`h-11 shrink-0 cursor-pointer font-sans text-[14px] whitespace-nowrap transition-colors ${
                    active ? "font-semibold text-white" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ width: TAB_WIDTH }}
                >
                  {t(CATEGORY_KEY[value])}
                </button>
              );
            })}
          </div>

          {/* The comp's underline: a 3px track the width of the whole strip,
              with a white segment exactly one tab wide under the active one. */}
          <div aria-hidden className="relative h-[3px] w-full rounded-full bg-white/8">
            <div
              data-testid="category-underline"
              className="absolute inset-y-0 left-0 rounded-full bg-white transition-transform duration-200"
              style={{
                width: TAB_WIDTH,
                transform: `translateX(${activeIndex * TAB_PITCH}px)`,
              }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("loadingGames")}
          className="-mx-1 mt-[30px] flex flex-col gap-3"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div key={index} className={`${ARKADE_CARD_FRAME} bg-surface animate-pulse`} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center font-sans text-[13.5px] font-normal text-white/50">
          {t("noGamesFound")}
        </div>
      ) : (
        // One card per row at any phone width, 12px apart, 16px from the edge.
        <ul className="-mx-1 mt-[30px] flex list-none flex-col gap-3">
          {visible.map((game) => (
            <li key={game.id} className="min-w-0">
              <ArkadeGameCard game={game} surface="phone" onActivate={reportGameOpened} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
