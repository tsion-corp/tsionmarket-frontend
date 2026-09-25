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
import { ArkadeFeaturedBanner } from "@/features/casino/components/arkade-featured-banner";
import { ArkadeSectionHeader } from "@/features/casino/components/arkade-section-header";
import { FEATURED_STATS } from "@/features/casino/lib/featured";
import { SearchIcon, WalletIcon } from "@/components/ui/icons";
import { ShineToggle } from "@/components/shine/shine-toggle";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { CasinoPresenceByGame } from "@/features/casino/lib/api/presence";

/**
 * Arkade on the desktop (Figma 2234:11125 for the head and tab bar, over the
 * four card rails from the earlier comp).
 *
 * The head carries the eyebrow, the hero line and the market-balance card with
 * its Add-funds action; below it a four-tab filter bar with a sliding underline
 * sits opposite a search field. The catalogue is chunked into rails of three,
 * and the tab bar plus the search field filter the stack.
 *
 * Every string is Mona Sans (font-serif) — the app does not load Quicksand, so
 * the comp's Quicksand labels take the display face the rest of the surface
 * already uses. Opening a game goes out through `onSelectGame`, Add funds
 * through `onAddFunds`; the one hook here is the balance the head shows.
 */

// Three 370px cards 13px apart overrun the comp's 1038px strip, which is what
// makes the third card peek and the rail scroll. Chunking at three reproduces
// that exactly.
const ROW_SIZE = 3;

// USDC on Base is the spendable market balance, the same rail the trade tickets
// spend from.
const PAY_SYMBOL = "USDC";
const PAY_NETWORK = "base-mainnet";

// One tab is 101px wide with a 12px gap, so the underline segment slides 113px
// from one tab to the next.
const TAB_PITCH = 113;

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
  games?: CasinoGame[];
  loading?: boolean;
  onSelectGame?: (game: CasinoGame) => void;
  // Opens the deposit flow from the head's Add-funds action.
  onAddFunds?: () => void;
  defaultCategory?: GameCategoryFilter;
  presenceByGame?: CasinoPresenceByGame;
}

export function ArkadeDesktop({
  games = CASINO_GAMES,
  loading = false,
  onSelectGame,
  onAddFunds,
  defaultCategory = "All games",
  presenceByGame,
}: ArkadeDesktopProps) {
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
  const balanceLabel = `${balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;

  const rows = visible.length > 0 ? chunk(visible, ROW_SIZE) : [[]];
  const activeIndex = Math.max(0, DESKTOP_CATEGORIES.indexOf(category));

  // The banner and the Trending/New split are the resting layout. A search or a
  // category other than All is a lookup, so it collapses to plain rails instead
  // — the hero and section headings would fight the filtered result.
  const searching = query.trim().length > 0 || category !== "All games";
  const featured = useMemo(() => visible.filter((game) => !game.comingSoon).slice(0, 3), [visible]);
  const trending = visible.slice(0, ROW_SIZE);
  const newRows = chunk(visible.slice(ROW_SIZE), ROW_SIZE);

  return (
    // Root: the sections stack 36px apart (2234:11125). Width comes from the
    // page shell, which follows the portfolio flow (centred, max-w-[1520px]),
    // so Arkade sits on the same column as the rest of the app.
    <div className="flex w-full flex-col gap-9">
      {/* ── Head: eyebrow + hero, and the market-balance card (2234:11126) ── */}
      <div className="flex w-full items-center justify-between gap-[37px]">
        <div className="flex max-w-[626px] flex-col gap-3">
          <p className="font-serif text-[14px] leading-none font-bold text-[#8a8a8a]">
            {t("title")}
          </p>
          <h1 className="font-serif text-[36px] leading-[1.1] font-semibold tracking-[-1.08px] text-white capitalize">
            {t("heroTitle")}
          </h1>
        </div>

        {/* Balance card (2234:11130): w-351, px-24 py-12, rounded-20, gap-12 */}
        <div className="flex w-[351px] shrink-0 items-center gap-3 rounded-[20px] bg-[#161616] px-6 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* "Ready to play" sits in its own 36.694px row (2234:11132) */}
            <div className="flex h-[36.694px] items-center">
              <span className="font-serif text-[15px] leading-[1.1] font-semibold tracking-[-0.15px] whitespace-nowrap text-white/60">
                {t("readyToPlay")}
              </span>
            </div>
            {/* Balance + label grouped, 8px apart (2234:11138) */}
            <div className="flex flex-col gap-2">
              <span className="tnum font-serif text-[24px] leading-[1.03] font-bold tracking-[-0.36px] whitespace-nowrap text-white">
                {portfolio.loading ? "—" : balanceLabel}
              </span>
              <span className="font-serif text-[13px] leading-[1.1] font-semibold tracking-[-0.195px] text-white/60">
                {t("marketBalance")}
              </span>
            </div>
          </div>
          {/* Add funds: chrome pill (2234:11141), w-119, px-10.472 py-12.376 */}
          <button
            type="button"
            onClick={onAddFunds}
            style={{
              backgroundImage:
                "linear-gradient(178.96deg, #ffffff 2.36%, #ededf0 38.57%, #cbcbd1 62.39%, #f5f5f8 97.64%)",
            }}
            className="flex w-[119px] shrink-0 cursor-pointer items-center justify-center gap-[7.616px] rounded-full px-[10.472px] py-[12.376px] shadow-[0_1.548px_3.097px_rgba(0,0,0,0.5),inset_0_0.774px_0_rgba(255,255,255,0.95)] transition-opacity hover:opacity-90"
          >
            <WalletIcon size={16} className="shrink-0 text-[#0a0a0a]" />
            <span className="font-serif text-[13px] leading-[1.1] font-semibold tracking-[-0.13px] whitespace-nowrap text-[#0a0a0a]">
              {t("addFunds")}
            </span>
          </button>
        </div>
      </div>

      {/* Shine sits between the head and the catalogue, at full width, because
          it is on by default and posts publicly without asking each time. The
          place someone finds that out has to be the page they play on, not a
          settings sheet. One switch covers every game here. */}
      <ShineToggle service="arcade" />

      {/* ── Tab bar + search (2234:11148) ── */}
      <div className="flex w-full items-center justify-between gap-6">
        <div role="group" aria-label={t("categoriesLabel")} className="shrink-0">
          {/* Four tabs, 101px each, 12px apart (2234:11151) */}
          <div className="flex items-center gap-3">
            {DESKTOP_CATEGORIES.map((value) => {
              const active = value === category;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(value)}
                  className={`flex h-[38px] w-[101px] shrink-0 cursor-pointer items-center justify-center rounded-full p-[10px] font-serif text-[14px] leading-4 font-bold whitespace-nowrap transition-colors ${
                    active ? "text-white" : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {t(CATEGORY_KEY[value])}
                </button>
              );
            })}
          </div>
          {/* Underline (2234:11160): a 592px track with a 109px white segment
              that slides one tab pitch (113px) per tab. */}
          <div aria-hidden className="relative mt-0.5 h-[3px] w-[592px] rounded-[2.4px] bg-white/8">
            <div
              className="absolute top-0 left-[1.08px] h-[3px] w-[109.428px] rounded-full bg-white transition-transform duration-200"
              style={{ transform: `translateX(${activeIndex * TAB_PITCH}px)` }}
            />
          </div>
        </div>

        {/* Search (2234:11164): w-422, h-46, rounded-50.554, pl-24 pr-10.111 */}
        <div className="flex h-[46px] w-[422px] shrink-0 items-center gap-[6.067px] rounded-[50.554px] border-[1.011px] border-white/12 bg-white/5 py-[6.067px] pr-[10.111px] pl-6">
          <SearchIcon size={14} className="shrink-0 text-white/45" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchGames")}
            className="min-w-0 flex-1 bg-transparent font-serif text-[16px] font-semibold tracking-[-0.16px] text-white outline-none placeholder:text-white/45"
          />
        </div>
      </div>

      {/* ── Catalogue ── */}
      {searching ? (
        // Filtered lookup: plain rails, no banner or section headings.
        <div className="flex flex-col gap-[14px]">
          {rows.map((row, index) => (
            <ArkadeDesktopRow
              key={row[0]?.id ?? `row-${index}`}
              games={row}
              loading={loading}
              label={t("rowLabel", { index: index + 1 })}
              onSelectGame={onSelectGame}
              presenceByGame={presenceByGame}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Featured banner (2234:10801) */}
          {featured.length > 0 ? (
            <ArkadeFeaturedBanner games={featured} stats={FEATURED_STATS} onPlay={onSelectGame} />
          ) : null}

          {/* Trending Now (2234:10828): the first rail under its heading */}
          <section className="flex flex-col gap-6">
            <ArkadeSectionHeader title={t("trendingTitle")} subtitle={t("trendingSubtitle")} />
            <ArkadeDesktopRow
              games={trending}
              loading={loading}
              label={t("trendingTitle")}
              badge="hot"
              firstBadge="mostPlayed"
              onSelectGame={onSelectGame}
              presenceByGame={presenceByGame}
            />
          </section>

          {/* New on Arkade (2234:10884): the remaining rails under their heading */}
          {newRows.length > 0 ? (
            <section className="flex flex-col gap-6">
              <ArkadeSectionHeader title={t("newTitle")} subtitle={t("newSubtitle")} />
              <div className="flex flex-col gap-[14px]">
                {newRows.map((row, index) => (
                  <ArkadeDesktopRow
                    key={row[0]?.id ?? `new-row-${index}`}
                    games={row}
                    loading={loading}
                    label={t("newTitle")}
                    badge="new"
                    onSelectGame={onSelectGame}
                    presenceByGame={presenceByGame}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
