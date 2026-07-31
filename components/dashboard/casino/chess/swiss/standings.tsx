"use client";

import { useTranslations } from "next-intl";
import { CasinoEmpty } from "@/components/dashboard/casino/casino-state";
import type { SwissStanding } from "@/lib/casino/api/swiss";

// The score column reads "2-0-1" for two wins, no draws, one loss. Byes count
// toward points but not toward this line, matching how the service scores.
function scoreLine(s: SwissStanding): string {
  return `${s.wins}-${s.draws}-${s.losses}`;
}

// Half points come back as .5 floats; whole scores should not read "2.0".
function formatPoints(points: number): string {
  return Number.isInteger(points) ? `${points}` : points.toFixed(1);
}

export function SwissStandings({
  standings,
  yourName,
}: {
  standings: SwissStanding[];
  yourName: string | null;
}) {
  const t = useTranslations("casino.chess.swiss");

  if (standings.length === 0) {
    return <CasinoEmpty>{t("standingsEmpty")}</CasinoEmpty>;
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-white/8">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[44px_2fr_70px_70px_90px] bg-white/4 px-4.5 py-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
          <div>{t("colRank")}</div>
          <div>{t("colPlayer")}</div>
          <div className="text-right">{t("colPoints")}</div>
          <div className="text-right">{t("colTieBreak")}</div>
          <div className="text-right">{t("colScore")}</div>
        </div>
        {standings.map((s) => (
          <div
            key={s.name}
            className={`grid grid-cols-[44px_2fr_70px_70px_90px] items-center border-t border-white/6 px-4.5 py-3 text-[13px] ${
              s.absent ? "opacity-45" : ""
            }`}
          >
            <div className="tnum font-normal text-white/50">{s.rank}</div>
            <div className="truncate pr-3">
              {s.name}
              {s.name === yourName ? (
                <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[10.5px] font-semibold text-white/70">
                  {t("you")}
                </span>
              ) : null}
              {s.absent ? (
                <span className="ml-2 text-[11px] font-normal text-white/50">{t("absent")}</span>
              ) : null}
            </div>
            <div className="tnum text-right">{formatPoints(s.points)}</div>
            <div className="tnum text-right font-normal text-white/50">
              {formatPoints(s.tieBreak)}
            </div>
            <div className="tnum text-right font-normal text-white/50">{scoreLine(s)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
