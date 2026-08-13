"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSwissList } from "@/features/casino/hooks/use-casino-swiss";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { SwissCreateForm } from "@/features/casino/components/chess/swiss/create-form";
import type { SwissGameKind, SwissState, SwissSummary } from "@/features/casino/lib/api/swiss";
import { hasPositiveUsdc } from "@/features/casino/lib/api/cashier";

// Running events lead: they are what a visitor can watch right now. Open ones
// follow because they are joinable, finished ones close the page as a record.
const GROUP_ORDER: readonly SwissState[] = ["running", "open", "finished"];

const GROUP_TITLE_KEY: Record<SwissState, string> = {
  running: "groupRunning",
  open: "groupOpen",
  finished: "groupFinished",
};

function TournamentRow({ tournament }: { tournament: SwissSummary }) {
  const t = useTranslations("casino.chess.swiss");

  const roundCell =
    tournament.state === "open"
      ? t("notStarted")
      : t("roundOf", { round: tournament.round, total: tournament.nbRounds });

  return (
    <Link
      href={
        tournament.game === "draughts"
          ? `/casino/checkers/tournaments/${tournament.id}`
          : `/casino/chess/swiss/${tournament.id}`
      }
      className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] items-center border-t border-white/6 px-4.5 py-3 text-[13px] transition-colors hover:bg-white/4"
    >
      <div className="truncate pr-3">
        <div className="truncate">{tournament.name}</div>
        {hasPositiveUsdc(tournament.entryFeeUsdc) ? (
          <div className="tnum truncate text-[11.5px] font-normal text-[#91c85c]">
            {tournament.entryFeeUsdc} USDC entry · 50/50 pool
          </div>
        ) : null}
        {tournament.state === "finished" && tournament.winner ? (
          <div className="truncate text-[11.5px] font-normal text-white/50">
            {t("winner", { name: tournament.winner })}
          </div>
        ) : null}
      </div>
      <div className="font-normal text-white/50">{roundCell}</div>
      <div className="tnum font-normal text-white/50">
        {t("playersCount", { count: tournament.participantCount })}
      </div>
      <div className="tnum font-normal text-white/50">{tournament.timeControl}</div>
      {tournament.state === "open" ? (
        <span className="bg-up text-up-ink rounded-full py-1.5 text-center font-sans text-[12px] font-medium">
          {t("join")}
        </span>
      ) : (
        <span className="rounded-full border border-white/15 py-1.5 text-center font-sans text-[12px] font-semibold text-white/70">
          {t("view")}
        </span>
      )}
    </Link>
  );
}

function TournamentGroup({ state, items }: { state: SwissState; items: SwissSummary[] }) {
  const t = useTranslations("casino.chess.swiss");
  if (items.length === 0) return null;

  return (
    <div className="mb-9">
      <div className="ws-display mb-3 text-[18px]">{t(GROUP_TITLE_KEY[state])}</div>
      <div className="overflow-x-auto rounded-[14px] border border-white/8">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] bg-white/4 px-4.5 py-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            <div>{t("colName")}</div>
            <div>{t("colRound")}</div>
            <div>{t("colPlayers")}</div>
            <div>{t("colTimeControl")}</div>
            <div />
          </div>
          {items.map((item) => (
            <TournamentRow key={item.id} tournament={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SwissListSection({ game }: { game?: SwissGameKind } = {}) {
  const t = useTranslations("casino.chess.swiss");
  const { tournaments, isLoading, error, refetch } = useSwissList(game);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="ws-display text-[26px]">{t("title")}</div>
          <div className="text-[12.5px] font-normal text-white/55">{t("intro")}</div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="text-ink cursor-pointer rounded-full bg-white px-5 py-2.5 font-sans text-[13px] font-medium transition-transform hover:-translate-y-0.5"
        >
          {showCreate ? t("closeCreate") : t("createTitle")}
        </button>
      </div>

      {showCreate ? <SwissCreateForm game={game} /> : null}

      {error ? (
        <CasinoError error={error} subject={t("subject")} onRetry={refetch} />
      ) : isLoading ? (
        <CasinoLoading label={t("loading")} rows={4} />
      ) : tournaments.length === 0 ? (
        <CasinoEmpty>{t("empty")}</CasinoEmpty>
      ) : (
        GROUP_ORDER.map((state) => (
          <TournamentGroup
            key={state}
            state={state}
            items={tournaments.filter((item) => item.state === state)}
          />
        ))
      )}
    </div>
  );
}
