"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics/mixpanel";
import {
  CASINO_GAMES,
  TRACKED_GAMES,
  filterGames,
  type CasinoGame,
  type GameCategoryFilter,
} from "@/features/casino/lib/games";
import {
  ARKADE_CARD_FRAME,
  ArkadeGameCard,
  type ArkadeBadgeTone,
} from "@/features/casino/components/arkade-game-card";
import { ArkadeFeaturedBanner } from "@/features/casino/components/arkade-featured-banner";
import { ArkadeSectionHeader } from "@/features/casino/components/arkade-section-header";
import { FEATURED_STATS } from "@/features/casino/lib/featured";
import { SearchIcon, WalletIcon } from "@/components/ui/icons";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { CasinoPresenceByGame } from "@/features/casino/lib/api/presence";

/**
 * Arkade on a phone (Figma 2234:11169): the same surface the desktop draws,
 * stacked into one column. An intro line beside the wallet balance, the compact
 * featured banner, a search field, the category strip, then Trending and New as
 * horizontal rails of the desktop card — each card near full width with the next
 * peeking, so the rail reads as swipeable.
 *
 * From `md` up ArkadeDesktop takes over, so this renders phone-only. The card,
 * banner and section heading are the same components the desktop rail uses; only
 * the layout changes. This file owns the phone shell: the intro row, the search
 * and category controls, and the rails.
 */

// Rails split at three: the first three games are Trending, the rest are New,
// matching the desktop hub so the two surfaces show the same cut.
const ROW_SIZE = 3;

// USDC on Base is the spendable balance the pill shows, the rail games spend
// from, mirroring the desktop head.
const PAY_SYMBOL = "USDC";
const PAY_NETWORK = "base-mainnet";

// A 101px tab every 113px, the rhythm the desktop bar and the underline share.
const TAB_WIDTH = 101;
const TAB_PITCH = 113;

// The four filters the comp draws, the same set as the desktop bar.
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

const SKELETON_COUNT = 3;

// Each rail card is near the viewport width with the next peeking, capped so it
// never outgrows the desktop card on a large phone.
const RAIL_CARD = "w-[78vw] max-w-[330px] shrink-0";

// Analytics rides on the card's own click, as it did before: the phone
// navigates with a real anchor, so there is no route push to hang the event on.
// Both surfaces read the id from the one map in the catalogue, so neither can
// invent one nor go missing when the surface around it changes.
function reportGameOpened(game: CasinoGame) {
  const id = TRACKED_GAMES[game.id];
  if (id) track("game_opened", { game: id });
}

// One horizontal, snapping rail of desktop cards. Bleeds to the screen edges
// with a 16px lead-in kept as padding so the peeking card runs to the edge.
function ArkadeRail({
  games,
  label,
  badge,
  firstBadge,
  presenceByGame,
}: {
  games: CasinoGame[];
  label: string;
  badge?: ArkadeBadgeTone;
  firstBadge?: ArkadeBadgeTone;
  presenceByGame?: CasinoPresenceByGame;
}) {
  return (
    <ul
      aria-label={label}
      className="ws-no-scrollbar -mx-4 flex snap-x snap-mandatory list-none gap-[13px] overflow-x-auto px-4"
    >
      {games.map((game, index) => (
        <li key={game.id} className={`${RAIL_CARD} snap-start`}>
          <ArkadeGameCard
            game={game}
            surface="desktop"
            render="link"
            presence={presenceByGame?.[game.id as keyof CasinoPresenceByGame]}
            badge={index === 0 && firstBadge ? firstBadge : badge}
            onActivate={reportGameOpened}
          />
        </li>
      ))}
    </ul>
  );
}

export interface ArkadeMobileProps {
  // The catalogue to lay out. Defaults to the shipped one, so a route can mount
  // the surface without threading static product structure through itself.
  games?: CasinoGame[];
  // Draws placeholder cards while a caller merges live data before rendering.
  loading?: boolean;
  // Opens the deposit flow from the balance pill.
  onAddFunds?: () => void;
  // Fired with the featured game when its Play Now is pressed. The rail cards
  // navigate themselves through their anchor, so this is only the banner's.
  onSelectGame?: (game: CasinoGame) => void;
  // Which filter the surface opens on.
  defaultCategory?: GameCategoryFilter;
  presenceByGame?: CasinoPresenceByGame;
}

export function ArkadeMobile({
  games = CASINO_GAMES,
  loading = false,
  onAddFunds,
  onSelectGame,
  defaultCategory = "All games",
  presenceByGame,
}: ArkadeMobileProps = {}) {
  const t = useTranslations("casino.hub");
  const [category, setCategory] = useState<GameCategoryFilter>(defaultCategory);
  const [query, setQuery] = useState("");
  const portfolio = usePortfolio();

  const visible = useMemo(
    () => filterGames(games, category, query, (game) => t(`games.${game.id}.name`)),
    [games, category, query, t]
  );

  const balance = useMemo(
    () =>
      portfolio.tokens
        .filter((token) => token.symbol === PAY_SYMBOL && token.network === PAY_NETWORK)
        .reduce((sum, token) => sum + token.balance, 0),
    [portfolio.tokens]
  );
  const balanceLabel = balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // The banner and the Trending/New split are the resting layout; a search or a
  // non-All category is a lookup, so it collapses to a single rail.
  const searching = query.trim().length > 0 || category !== "All games";
  const featured = useMemo(() => visible.filter((game) => !game.comingSoon).slice(0, 3), [visible]);
  const trending = visible.slice(0, ROW_SIZE);
  const newGames = visible.slice(ROW_SIZE);
  const activeIndex = Math.max(0, DESKTOP_CATEGORIES.indexOf(category));

  return (
    <div className="flex w-full flex-col gap-6 px-4 pt-4 pb-8">
      {/* The ARKADE wordmark rides the header band above this surface, so the
          heading is here for the document outline only. */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Intro line beside the balance pill (2234:11183). */}
      <div className="flex items-center gap-5">
        <p className="min-w-0 flex-1 font-serif text-[13px] leading-[1.3] font-semibold tracking-[-0.13px] whitespace-normal text-white capitalize">
          {t("mobileIntro")}
        </p>
        <button
          type="button"
          onClick={onAddFunds}
          className="flex w-[119px] shrink-0 cursor-pointer items-center justify-center gap-[7.616px] rounded-full bg-white/5 px-[10.472px] py-[12.376px] shadow-[0_1.548px_6.194px_rgba(0,0,0,0.5)]"
        >
          <WalletIcon size={16} className="shrink-0 text-white" />
          <span className="font-serif text-[13px] leading-[1.1] font-bold tracking-[-0.13px] whitespace-nowrap text-white">
            {portfolio.loading ? "—" : balanceLabel}
          </span>
        </button>
      </div>

      {/* Featured banner, resting layout only (2234:11192). */}
      {!searching && featured.length > 0 ? (
        <ArkadeFeaturedBanner
          variant="mobile"
          games={featured}
          stats={FEATURED_STATS}
          onPlay={onSelectGame}
        />
      ) : null}

      {/* Search (2234:11221). */}
      <div className="flex h-[51px] w-full items-center gap-1 rounded-[50px] border-2 border-white/[0.02] bg-white/5 px-6 py-3">
        <SearchIcon size={14} className="shrink-0 text-white/45" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchGames")}
          className="min-w-0 flex-1 bg-transparent font-serif text-[13px] font-bold text-white outline-none placeholder:text-white/45"
        />
      </div>

      {/* Category strip + underline (2234:11228), scrolling past the edge. */}
      <div className="ws-no-scrollbar -mx-4 overflow-x-auto px-4">
        <div role="group" aria-label={t("categoriesLabel")} className="w-max">
          <div className="flex items-center gap-3">
            {DESKTOP_CATEGORIES.map((value) => {
              const active = value === category;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(value)}
                  style={{ width: TAB_WIDTH }}
                  className={`flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-full p-[10px] font-serif text-[12px] font-bold whitespace-nowrap transition-colors ${
                    active ? "text-white" : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {t(CATEGORY_KEY[value])}
                </button>
              );
            })}
          </div>
          <div aria-hidden className="relative h-[3px] w-[440px] rounded-[2.4px] bg-white/8">
            <div
              data-testid="category-underline"
              className="absolute top-0 left-px h-[3px] rounded-full bg-white transition-transform duration-200"
              style={{ width: TAB_WIDTH, transform: `translateX(${activeIndex * TAB_PITCH}px)` }}
            />
          </div>
        </div>
      </div>

      {/* Catalogue. */}
      {loading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("loadingGames")}
          className="ws-no-scrollbar -mx-4 flex gap-[13px] overflow-hidden px-4"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div
              key={index}
              className={`${ARKADE_CARD_FRAME} bg-surface ${RAIL_CARD} animate-pulse`}
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center font-serif text-[13.5px] font-normal text-white/50">
          {t("noGamesFound")}
        </div>
      ) : searching ? (
        // Filtered lookup: one rail, no banner or section headings.
        <ArkadeRail games={visible} label={t("title")} presenceByGame={presenceByGame} />
      ) : (
        <div className="flex flex-col gap-9">
          <section className="flex flex-col gap-6">
            <ArkadeSectionHeader title={t("trendingTitle")} subtitle={t("trendingSubtitle")} />
            <ArkadeRail
              games={trending}
              label={t("trendingTitle")}
              badge="hot"
              firstBadge="mostPlayed"
              presenceByGame={presenceByGame}
            />
          </section>

          {newGames.length > 0 ? (
            <section className="flex flex-col gap-6">
              <ArkadeSectionHeader title={t("newTitle")} subtitle={t("newSubtitle")} />
              <ArkadeRail
                games={newGames}
                label={t("newTitle")}
                badge="new"
                presenceByGame={presenceByGame}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
