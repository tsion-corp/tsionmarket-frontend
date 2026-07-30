"use client";

import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { WithdrawModal } from "@/components/dashboard/modals/withdraw-modal";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { usePortfolio } from "@/hooks/use-portfolio";
import { WinsTicker } from "@/components/dashboard/casino/wins-ticker";
import { GameTile } from "@/components/dashboard/casino/game-tile";
import {
  CASINO_GAMES,
  GAME_CATEGORIES,
  filterGames,
  type GameCategoryFilter,
} from "@/lib/casino/games";

export function HubSection() {
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const { tokens } = usePortfolio();
  const [category, setCategory] = useState<GameCategoryFilter>("All games");
  const [search, setSearch] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // The balance games spend from: the player's Base ETH, shown as plain money.
  // Same derivation the Last Man Standing game uses, so the numbers always agree.
  const ethHolding = tokens.find(
    (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "ETH"
  );
  const balanceUsd = ethHolding?.valueUsd ?? 0;

  const games = useMemo(() => filterGames(CASINO_GAMES, category, search), [category, search]);

  return (
    <div className="relative mx-auto w-full max-w-[1520px] overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Ambient glows, violet up top and a faint gold wash lower left. */}
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
          <Eyebrow>Casino · Skill and chance</Eyebrow>
          <h2 className="ws-display mt-2.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(30px,4.4vw,44px)] tracking-[-0.02em] text-transparent">
            Casino
          </h2>
          <p className="mt-1.5 flex items-center gap-2.5 text-[13.5px] font-normal text-white/55">
            <span aria-hidden className="bg-grey-100 inline-block h-px w-[22px]" />
            Skill and chance. Real stakes.
          </p>
        </div>

        {/* Wallet strip: the spendable balance plus a way to take money out. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="ws-inset px-4 py-2.5">
            <div className="text-[10.5px] font-normal tracking-[0.08em] text-white/45 uppercase">
              Casino balance
            </div>
            <div className="ws-display tnum text-grey-100 text-[19px]">
              {mask(money.format(balanceUsd))}
            </div>
          </div>
          <button
            onClick={() => setWithdrawOpen(true)}
            className="cursor-pointer rounded-full border border-white/15 px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="mt-6">
        <WinsTicker />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="font-sans text-[20px] font-bold text-white">{category}</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for your favourite game"
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
              {c}
            </button>
          );
        })}
      </div>

      {games.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] font-normal text-white/50">
          No game found — <span className="text-accent">suggest one</span>
        </div>
      ) : (
        <div className="mt-5 grid [grid-auto-flow:dense] grid-cols-6 gap-4">
          {games.map((g) => (
            <GameTile key={g.id} game={g} />
          ))}
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
