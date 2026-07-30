"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { WithdrawModal } from "@/components/dashboard/modals/withdraw-modal";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useCasinoHub } from "@/hooks/use-casino-hub";
import { WinsTicker } from "@/components/dashboard/casino/wins-ticker";
import { GameTile } from "@/components/dashboard/casino/game-tile";
import { CasinoError } from "@/components/dashboard/casino/casino-state";
import { amountUsd } from "@/lib/casino/money";
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
  const { recentWins, presence, error } = useCasinoHub();
  const [category, setCategory] = useState<GameCategoryFilter>("All games");
  const [search, setSearch] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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
          <p className="mt-1.5 flex items-center gap-2.5 text-[13.5px] font-normal text-white/55">
            <span aria-hidden className="bg-grey-300 inline-block h-px w-[22px]" />
            {t("tagline")}
          </p>
        </div>

        {/* The same balance the rest of the platform shows: games spend from it
            directly, so there is no separate casino float to top up. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="ws-inset px-4 py-2.5">
            <div className="text-[10.5px] font-normal tracking-[0.08em] text-white/45 uppercase">
              {t("yourBalance")}
            </div>
            <div className="ws-display tnum text-grey-100 text-[19px]">
              {wallet.isLoading ? "—" : mask(wallet.format(wallet.balanceUsd))}
            </div>
          </div>
          <button
            onClick={() => setWithdrawOpen(true)}
            className="cursor-pointer rounded-full border border-white/15 px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            {t("withdraw")}
          </button>
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

      {/* A hub with no live figures still lists every game, so the casino is
          browsable even when the presence service is down. */}
      {error ? (
        <div className="mt-5">
          <CasinoError error={error} subject={t("liveActivitySubject")} />
        </div>
      ) : null}

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

      <ModalShell
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        contentKey="casino-withdraw"
      >
        <WithdrawModal onClose={() => setWithdrawOpen(false)} />
      </ModalShell>
    </div>
  );
}
