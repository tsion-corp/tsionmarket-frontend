"use client";

import Link from "next/link";
import { LIVE_CHESS_GAMES, OPEN_CHALLENGES } from "@/lib/casino/demo";
import { formatCasinoAmount } from "@/lib/casino/stakes";
import { stakeQuery } from "@/lib/casino/stake-params";

export function LobbySection() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
      <div className="mb-8 flex flex-wrap gap-3.5">
        <Link
          href="/casino/chess/create"
          className="text-ink min-w-[260px] flex-1 cursor-pointer rounded-2xl bg-white px-6 py-5 text-left transition-transform hover:-translate-y-0.5"
        >
          <div className="ws-display mb-1 text-[20px]">Create staked game</div>
          <div className="text-[12.5px] font-normal opacity-65">
            Set your stake and time control
          </div>
        </Link>
        <Link
          href="/casino/chess/matchmaking"
          className="ws-glass min-w-[260px] flex-1 cursor-pointer rounded-2xl px-6 py-5 text-left text-white transition-transform hover:-translate-y-0.5"
        >
          <div className="ws-display mb-1 text-[20px]">Quick match</div>
          <div className="text-[12.5px] font-normal text-white/55">
            We&apos;ll pair you with someone now
          </div>
        </Link>
      </div>

      <div className="ws-display mb-3 text-[18px]">Live now</div>
      <div className="mb-9 flex gap-3.5 overflow-x-auto pb-2">
        {LIVE_CHESS_GAMES.map((g) => (
          <Link
            key={`${g.white}-${g.black}`}
            href="/casino/chess/watch"
            className="ws-inset flex-[0_0_290px] cursor-pointer rounded-[14px] p-4 text-left text-white transition-colors hover:border-white/20"
          >
            <div className="mb-2.5 flex justify-between text-[13px]">
              <span>{g.white}</span>
              <span className="font-normal text-white/50">vs</span>
              <span>{g.black}</span>
            </div>
            <div className="mb-2.5 flex h-[5px] overflow-hidden rounded-[3px] bg-white/10">
              <div className="h-full bg-white" style={{ width: `${g.evalPct}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="tnum text-[12px] font-normal text-white/50">
                W {g.oddsWhite} · B {g.oddsBlack}
              </div>
              <div className="ws-display tnum text-grey-100 text-[16px]">{g.pot}</div>
            </div>
            <div className="mt-2 text-[11px] font-normal text-white/50">{g.viewers} watching</div>
          </Link>
        ))}
      </div>

      <div className="ws-display mb-3 text-[18px]">Open challenges</div>
      <div className="overflow-x-auto rounded-[14px] border border-white/8">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] bg-white/4 px-4.5 py-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            <div>Opponent</div>
            <div>Rating</div>
            <div>Stake</div>
            <div>Time control</div>
            <div />
          </div>
          {OPEN_CHALLENGES.map((c) => (
            <div
              key={c.name}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] items-center border-t border-white/6 px-4.5 py-3 text-[13px]"
            >
              <div>{c.name}</div>
              <div className="tnum font-normal text-white/50">{c.rating}</div>
              <div className="tnum text-grey-100">
                {formatCasinoAmount(c.stakeMinor, c.currency)}
              </div>
              <div className="font-normal text-white/50">{c.tcLabel}</div>
              <Link
                href={`/casino/chess/play?${stakeQuery(c.stakeMinor, c.currency, c.tc)}`}
                className="bg-up text-up-ink cursor-pointer rounded-full py-1.5 text-center font-sans text-[12px] font-bold"
              >
                Join
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
