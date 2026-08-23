"use client";

import Link from "next/link";
import { playerIdentityLabel } from "@/features/casino/lib/chess/social";
import type { ChessMatch, ChessPlayer } from "@/features/casino/lib/api/types";
import { CameraIcon } from "@/features/casino/components/chess/broadcast/live-video-room";

function playerLabel(player: ChessPlayer | null, fallback: string): string {
  if (!player) return fallback;
  return playerIdentityLabel(player.username || player.walletAddress, player);
}

function speedLabel(timeControl: string): string {
  const minutes = Number.parseInt(timeControl.split("+")[0] ?? "", 10);
  if (!Number.isFinite(minutes)) return "Live";
  if (minutes <= 2) return "Bullet";
  if (minutes <= 8) return "Blitz";
  return "Rapid";
}

export function LiveGameList({
  matches,
  ownedMatchIds,
}: {
  matches: ChessMatch[];
  ownedMatchIds: ReadonlySet<string>;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#292b2d] bg-[#0b0c0d] shadow-[0_24px_70px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-[#292b2d] bg-[#111214] px-4 text-[11px] font-semibold tracking-[0.08em] text-[#8e959a] uppercase">
        <span>Live boards</span>
        <span>{matches.length} playing</span>
      </div>
      <div className="divide-y divide-white/7">
        {matches.map((match) => {
          const owned = ownedMatchIds.has(match.id);
          const href = owned
            ? `/casino/chess/play?match=${encodeURIComponent(match.id)}`
            : `/casino/chess/watch?match=${encodeURIComponent(match.id)}`;
          return (
            <Link
              key={match.id}
              href={href}
              className="group grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.045] sm:px-5"
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#d64b45] shadow-[0_0_10px_rgba(214,75,69,0.58)]" />
                  <span className="truncate text-[13px] font-medium text-white/88">
                    {playerLabel(match.white, "White")}
                  </span>
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-2 pl-4">
                  <span className="truncate text-[13px] font-medium text-white/72">
                    {playerLabel(match.black, "Black")}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-[11px] text-white/58">
                    {match.timeControl} · {speedLabel(match.timeControl)}
                  </span>
                  <span className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-white/34">
                    {match.videoEnabled ? (
                      <>
                        <CameraIcon className="h-3.5 w-3.5" />
                        Player video
                      </>
                    ) : match.stakeUsdc ? (
                      `${match.stakeUsdc} USDC stake`
                    ) : (
                      "Rated game"
                    )}
                  </span>
                </span>
                <span className="rounded-[4px] border border-[#454c52] bg-[#171a1d] px-3 py-1.5 text-[11px] font-semibold text-[#bfc4c7] transition-colors group-hover:border-[#7b848b] group-hover:bg-[#282d31] group-hover:text-white">
                  {owned ? "Resume" : "Watch"}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
