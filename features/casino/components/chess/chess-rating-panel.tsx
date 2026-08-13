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
    return <div className="mb-7 h-[116px] animate-pulse rounded-[14px] bg-white/[0.035]" />;
  }
  if (error && ratings.length === 0) return null;

  return (
    <section className="mb-7 overflow-hidden rounded-[14px] border border-white/8 bg-white/[0.025]">
      <div className="flex items-center justify-between gap-3 border-b border-white/7 px-4 py-3.5">
        <div>
          <div className="text-[14px] font-semibold text-white/88">Chess ratings</div>
          <div className="mt-0.5 text-[11.5px] text-white/42">
            Glicko ratings update after every rated game.
          </div>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] tracking-[0.07em] text-white/42 uppercase">
          Rated
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/6 sm:grid-cols-3 lg:grid-cols-6">
        {ratings.map((perf) => (
          <button
            key={perf.perfKey}
            type="button"
            onClick={() => selectPerf(perf.perfKey)}
            className={`cursor-pointer px-4 py-3 text-left transition-colors ${
              selectedPerf === perf.perfKey
                ? "bg-accent/12 text-white"
                : "bg-[#181817] text-white/66 hover:bg-white/[0.045]"
            }`}
          >
            <div className="text-[10px] tracking-[0.06em] text-white/38 uppercase">
              {PERF_LABEL[perf.perfKey]}
            </div>
            <div className="tnum mt-1 text-[21px] leading-none font-semibold">
              {perf.rating}
              {perf.provisional ? <span className="text-[13px] text-white/42">?</span> : null}
            </div>
            <div className="mt-1 text-[10.5px] text-white/34">
              {perf.games} {perf.games === 1 ? "game" : "games"}
            </div>
          </button>
        ))}
      </div>

      {history.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/7 px-4 py-3">
          <span className="mr-1 shrink-0 text-[10px] tracking-[0.06em] text-white/34 uppercase">
            Recent {PERF_LABEL[selectedPerf]}
          </span>
          {history.slice(0, 8).map((entry) => (
            <Link
              key={`${entry.matchId}:${entry.createdAt}`}
              href={`/casino/chess/review?match=${entry.matchId}`}
              className="tnum shrink-0 rounded-full border border-white/9 px-2.5 py-1 text-[11px] text-white/62 transition-colors hover:border-white/25 hover:text-white"
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
