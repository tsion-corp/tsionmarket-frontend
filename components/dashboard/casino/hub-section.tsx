"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useCasinoHub } from "@/hooks/use-casino-hub";
import { usePortfolio } from "@/hooks/use-portfolio";
import { WinsTicker } from "@/components/dashboard/casino/wins-ticker";
import { GameTile } from "@/components/dashboard/casino/game-tile";
import { amountUsd } from "@/lib/casino/money";
import { formatQty } from "@/lib/format";
import {
  CASINO_GAMES,
  GAME_CATEGORIES,
  filterGames,
  type GameCategoryFilter,
} from "@/lib/casino/games";

// Catalogue filter values mapped to their label keys in "casino.hub".
const CATEGORY_KEY: Record<GameCategoryFilter, string> = {
  "All games": "categoryAll",
  Skill: "categorySkill",
  Cards: "categoryCards",
  Draws: "categoryDraws",
  Racing: "categoryRacing",
  New: "categoryNew",
  "Coming soon": "categoryComingSoon",
};

export function HubSection() {
  const t = useTranslations("casino.hub");
  const wallet = useCasinoWallet();
  const { mask } = useBalanceVisibility();
  const { recentWins, presence } = useCasinoHub();
  const portfolio = usePortfolio();
  const usdcBalance =
    portfolio.tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const [category, setCategory] = useState<GameCategoryFilter>("All games");
  const [search, setSearch] = useState("");

  // Search matches the names the player actually sees, i.e. the localized ones.
  const games = useMemo(
    () => filterGames(CASINO_GAMES, category, search, (g) => t(`games.${g.id}.name`)),
    [category, search, t]
  );
  const presenceById = useMemo(
    () => new Map(presence.map((p) => [p.game as string, p])),
    [presence]
  );

  return (
    <div className="relative mx-auto w-full max-w-[1520px] overflow-hidden p-4 sm:p-6 lg:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 right-[-120px] -z-10 h-[560px] w-[560px] bg-[radial-gradient(circle,rgba(212,212,216,0.16),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-60 left-[-160px] -z-10 h-[520px] w-[520px] bg-[radial-gradient(circle,rgba(212,212,216,0.09),transparent_65%)]"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-2.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(30px,4.4vw,44px)] tracking-[-0.02em] text-transparent">
            {t("title")}
          </h2>
          <p className="mt-1.5 text-[13.5px] font-normal text-white/55">{t("tagline")}</p>
        </div>

        {/* The same balances the rest of the platform shows: games spend from
            them directly, so there is no separate casino float to top up. */}
        <div className="ws-inset px-4 py-3">
          <div className="text-[10.5px] font-normal tracking-[0.08em] text-white/45 uppercase">
            {t("yourBalance")} · Base
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-6">
            <span className="text-[12px] font-normal text-white/50">ETH</span>
            <span className="ws-display tnum text-grey-100 text-[15px]">
              {wallet.isLoading ? "—" : mask(formatQty(wallet.balance))}
              <span className="ml-1.5 text-[11.5px] font-normal text-white/45">
                {wallet.isLoading ? "" : mask(wallet.format(wallet.balanceUsd))}
              </span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <span className="text-[12px] font-normal text-white/50">USDC</span>
            <span className="ws-display tnum text-grey-100 text-[15px]">
              {mask(formatQty(usdcBalance))}
            </span>
          </div>
        </div>
      </div>

      {recentWins.length > 0 ? (
        <div className="mt-6">
          <WinsTicker wins={recentWins} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="font-sans text-[20px] font-bold text-white">
          {t(CATEGORY_KEY[category])}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ws-inset focus:border-accent/50 w-[280px] max-w-full rounded-full px-4 py-2.5 font-sans text-[13px] text-white outline-none"
        />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {GAME_CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-2 font-sans text-[12.5px] whitespace-nowrap transition-colors ${
                active
                  ? "border-accent bg-accent text-ink font-semibold"
                  : "border-white/10 text-white/55 hover:text-white"
              }`}
            >
              {t(CATEGORY_KEY[c])}
            </button>
          );
        })}
      </div>

      {games.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] font-normal text-white/50">
          {t("noGamesFound")}
        </div>
      ) : (
        <div className="mt-5 grid [grid-auto-flow:dense] grid-cols-6 gap-4">
          {games.map((g) => {
            const p = presenceById.get(g.id);
            return (
              <GameTile
                key={g.id}
                game={g}
                presence={p}
                headline={
                  p?.headline
                    ? wallet.format(amountUsd(p.headline, wallet.unitPriceUsd))
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
