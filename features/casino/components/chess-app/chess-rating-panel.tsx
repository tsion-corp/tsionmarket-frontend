"use client";

import Link from "next/link";
import { useChessRatings } from "@/features/casino/hooks/use-chess-ratings";
import type { ChessPerfKey } from "@/features/casino/lib/api/types";

const PERF_LABEL: Record<ChessPerfKey, string> = {
  standard: "Overall",
  ultraBullet: "UltraBullet",
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
};

export function ChessRatingPanel() {
  const { ratings, history, selectedPerf, selectPerf, isLoading, error } = useChessRatings();

  if (isLoading && ratings.length === 0) {
    return (
      <div className="mb-7 h-[116px] animate-pulse rounded-[14px] border border-[#292b2d] bg-[#0b0c0d]" />
    );
  }
  if (error && ratings.length === 0) return null;

  return (
    <section className="mb-7 overflow-hidden rounded-[14px] border border-[#292b2d] bg-[#0b0c0d] shadow-[0_24px_70px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#292b2d] bg-[#111214] px-4 py-3.5">
        <div>
          <div className="text-[14px] font-semibold text-[#f1f2f3]">Chess ratings</div>
          <div className="mt-0.5 text-[11.5px] text-[#8e9499]">
            Glicko ratings update after every rated game.
          </div>
        </div>
        <span className="rounded-full border border-[#343638] bg-[#08090a] px-2.5 py-1 text-[10px] tracking-[0.07em] text-[#9ba3a8] uppercase">
          Rated
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#353b40] sm:grid-cols-3 lg:grid-cols-6">
        {ratings.map((perf) => (
          <button
            key={perf.perfKey}
            type="button"
            onClick={() => selectPerf(perf.perfKey)}
            className={`relative cursor-pointer px-4 py-3 text-left transition-[background-color,box-shadow] ${
              selectedPerf === perf.perfKey
                ? "bg-[linear-gradient(145deg,#555d63_0%,#30353a_52%,#202428_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.35)]"
                : "bg-[#0b0c0d] text-[#b7bcc0] hover:bg-[#191b1d]"
            }`}
          >
            <div className="text-[10px] tracking-[0.06em] text-[#8f969b] uppercase">
              {PERF_LABEL[perf.perfKey]}
            </div>
            <div className="tnum mt-1 text-[21px] leading-none font-semibold">{perf.rating}</div>
            {perf.provisional ? (
              <div className="mt-1 text-[9px] tracking-[0.06em] text-[#aab0b4] uppercase">
                Provisional
              </div>
            ) : null}
            <div className="mt-1 text-[10.5px] text-[#7e858a]">
              {perf.games} {perf.games === 1 ? "game" : "games"}
            </div>
          </button>
        ))}
      </div>

      {history.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-[#292b2d] bg-[#08090a] px-4 py-3">
          <span className="mr-1 shrink-0 text-[10px] tracking-[0.06em] text-[#7f868b] uppercase">
            Recent {PERF_LABEL[selectedPerf]}
          </span>
          {history.slice(0, 8).map((entry) => (
            <Link
              key={`${entry.matchId}:${entry.createdAt}`}
              href={`/casino/chess/review?match=${entry.matchId}`}
              className="tnum shrink-0 rounded-full border border-[#454c51] bg-[#191c1f] px-2.5 py-1 text-[11px] text-[#c3c7ca] transition-colors hover:border-[#788087] hover:bg-[#282d31] hover:text-white"
            >
              {entry.ratingAfter}
              <span className={entry.ratingDiff >= 0 ? "text-up ml-1" : "text-down ml-1"}>
                {entry.ratingDiff >= 0 ? "+" : ""}
                {entry.ratingDiff}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
