"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useChessLobby } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { LiveGameList } from "@/features/casino/components/chess/broadcast/live-game-list";

function BroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path
        d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.7 4.7a10.3 10.3 0 0 0 0 14.6M19.3 4.7a10.3 10.3 0 0 1 0 14.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LiveGamesSection() {
  const wallet = useCasinoWallet();
  const { myActiveGames, liveMatches, isLoading, error, refetch } = useChessLobby(
    wallet.address ?? null
  );
  const matches = useMemo(() => [...myActiveGames, ...liveMatches], [liveMatches, myActiveGames]);
  const ownedMatchIds = useMemo(
    () => new Set(myActiveGames.map((match) => match.id)),
    [myActiveGames]
  );

  return (
    <section className="min-h-[calc(100svh-60px)] bg-black">
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-12 sm:px-6 lg:px-8 lg:pt-10">
        <header className="mb-7 flex flex-col gap-5 border-b border-[#343a3f] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] border border-[#292b2d] bg-[#111214] text-[#aeb5ba]">
              <BroadcastIcon />
            </span>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#d64b45] shadow-[0_0_10px_rgba(214,75,69,0.6)]" />
                <span className="text-[10px] font-bold tracking-[0.14em] text-[#dc625c] uppercase">
                  Live now
                </span>
              </div>
              <h1 className="font-serif text-[28px] leading-none font-bold tracking-[-0.03em] text-white sm:text-[34px]">
                Watch live chess
              </h1>
              <p className="mt-2 max-w-[580px] text-[13px] leading-5 text-white/48">
                Open any active board to follow the clocks, moves, player video and spectator room
                in real time.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/casino/chess/tournaments"
              className="rounded-[5px] border border-[#454c52] bg-[#171a1d] px-4 py-2 text-[12px] font-semibold text-[#bfc4c7] transition-colors hover:border-[#747d84] hover:bg-[#282d31] hover:text-white"
            >
              Tournaments
            </Link>
            <Link
              href="/casino/chess/create"
              className="rounded-[5px] border border-[#747d84]/70 bg-[linear-gradient(145deg,#596168_0%,#30353a_100%)] px-4 py-2 text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors hover:border-[#9ca3a8]"
            >
              Play a game
            </Link>
          </div>
        </header>

        {isLoading ? (
          <CasinoLoading label="Loading live chess games" rows={5} />
        ) : error ? (
          <CasinoError error={error} subject="live chess games" onRetry={refetch} />
        ) : matches.length > 0 ? (
          <LiveGameList matches={matches} ownedMatchIds={ownedMatchIds} />
        ) : (
          <div className="grid min-h-[280px] place-items-center rounded-[8px] border border-dashed border-[#343638] bg-[#0b0c0d] px-6 text-center">
            <div className="max-w-[420px]">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/8 bg-white/[0.035] text-white/30">
                <BroadcastIcon />
              </span>
              <h2 className="mt-4 text-[16px] font-semibold text-white/78">
                No live boards right now
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-5 text-white/42">
                Active public games appear here automatically. Start a game or check the current
                tournaments.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Link
                  href="/casino/chess/create"
                  className="rounded-[5px] border border-[#747d84]/70 bg-[linear-gradient(145deg,#596168_0%,#30353a_100%)] px-4 py-2 text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                >
                  Start a game
                </Link>
                <Link
                  href="/casino/chess/tournaments"
                  className="rounded-[5px] border border-white/10 px-4 py-2 text-[12px] font-semibold text-white/62"
                >
                  View tournaments
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
