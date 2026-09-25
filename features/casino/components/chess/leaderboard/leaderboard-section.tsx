"use client";

import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { useChessLeaderboard } from "@/features/casino/hooks/use-chess-leaderboard";
import { useAuthSession } from "@/hooks/use-auth-session";
import { LeaderboardFilters } from "./leaderboard-filters";
import { countryName, perfLabel } from "./leaderboard-format";
import { LeaderboardSidebar } from "./leaderboard-sidebar";
import { LeaderboardTable } from "./leaderboard-table";

function LeaderboardMark() {
  return (
    <span className="grid size-10 place-items-center rounded-[9px] border border-white/14 bg-[linear-gradient(145deg,#626a70_0%,#30363b_55%,#1c2024_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_26px_rgba(0,0,0,0.3)]">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <path d="M7 4v4a5 5 0 0 0 10 0V4H7Z" fill="currentColor" />
        <path d="M9.5 15h5v3h-5zM7 20h10" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}

export function LeaderboardSection() {
  const { profile } = useAuthSession();
  const board = useChessLeaderboard();
  const selectedPerfLabel = perfLabel(board.perf);
  const selectedCountryName = board.country ? countryName(board.country) : "Global";

  return (
    <section className="min-h-[calc(100svh-60px)] bg-[#08090a] text-white">
      <div className="mx-auto w-full max-w-[1120px] px-3 pt-5 pb-16 sm:px-5 sm:pt-8 lg:px-6">
        <header className="mb-5 flex items-center gap-3">
          <LeaderboardMark />
          <h1 className="font-serif text-[26px] leading-none font-bold tracking-[-0.03em] text-white sm:text-[30px]">
            Leaderboard
          </h1>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_286px] lg:items-start">
          <main className="min-w-0">
            <LeaderboardFilters
              perf={board.perf}
              country={board.country}
              representedCountries={board.countries?.items ?? []}
              onPerfChange={board.selectPerf}
              onCountryChange={board.selectCountry}
            />
            <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-white/30">
              <span>
                {(board.pool?.playerCount ?? board.countries?.totalPlayers ?? 0).toLocaleString()}{" "}
                ranked players
              </span>
              {board.isRefreshing ? <span className="text-white/52">Updating...</span> : null}
            </div>

            <div className="mt-2">
              {board.error ? (
                <CasinoError
                  error={board.error}
                  subject="chess leaderboard"
                  onRetry={board.refetch}
                />
              ) : board.isLoading ? (
                <CasinoLoading label="Loading chess leaderboard" rows={8} />
              ) : (
                <>
                  <LeaderboardTable
                    players={board.leaderboard?.items ?? []}
                    rules={board.rules}
                    refreshing={board.isRefreshing}
                  />
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={board.previousPage}
                      disabled={board.page <= 1}
                      className="h-8 cursor-pointer rounded-[7px] border border-[#41484d] bg-[#171a1d] px-3 text-[11px] font-semibold text-white/64 transition-colors hover:border-[#697279] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="tnum min-w-16 text-center text-[10px] font-bold tracking-[0.08em] text-white/30 uppercase">
                      Page {board.page}
                    </span>
                    <button
                      type="button"
                      onClick={board.nextPage}
                      disabled={!board.leaderboard?.hasMore}
                      className="h-8 cursor-pointer rounded-[7px] border border-[#41484d] bg-[#171a1d] px-3 text-[11px] font-semibold text-white/64 transition-colors hover:border-[#697279] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </main>

          <LeaderboardSidebar
            profileName={profile.name}
            avatarSeed={profile.avatarSeed}
            perf={selectedPerfLabel}
            scope={selectedCountryName}
            playerStats={board.playerStats}
            playerChart={board.playerChart}
            pool={board.pool}
            rules={board.rules}
          />
        </div>
      </div>
    </section>
  );
}
