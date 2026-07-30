"use client";

import Link from "next/link";
import { DEMO_CHALLENGER, type TimeControl } from "@/lib/casino/demo";
import { formatCasinoAmount, stakeBreakdown, type CasinoCurrency } from "@/lib/casino/stakes";
import { stakeQuery } from "@/lib/casino/stake-params";

function timeControlLabel(tc: TimeControl): string {
  return tc === "10+0" ? "10+0 Rapid" : `${tc} Blitz`;
}

interface InviteSectionProps {
  stakeMinor: number;
  currency: CasinoCurrency;
  timeControl: TimeControl;
}

// Landing screen for a challenge link. Rendered without the app shell so the
// invite reads like a focused offer, the way the recipient would meet it.
export function InviteSection({ stakeMinor, currency, timeControl }: InviteSectionProps) {
  const { feeMinor, potentialMinor } = stakeBreakdown(stakeMinor);
  const fmt = (minor: number) => formatCasinoAmount(minor, currency);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <div className="ws-glass w-full max-w-[440px] rounded-[20px] p-9 text-center">
        <div className="ws-display mb-5 text-[18px]">World Street · Chess challenge</div>
        <div className="mx-auto mb-3.5 h-14 w-14 rounded-full border border-white/10 bg-white/8" />
        <div className="text-[15px]">{DEMO_CHALLENGER.name}</div>
        <div className="mb-5 text-[12px] font-normal text-white/50">
          Rating {DEMO_CHALLENGER.rating} · {timeControlLabel(timeControl)}
        </div>
        <div className="ws-display tnum text-grey-100 text-[44px]">{fmt(stakeMinor)}</div>
        <div className="mb-5 text-[12px] font-normal text-white/50">stake to match</div>
        <div className="text-up mb-5 flex items-center justify-center gap-2 text-[12px]">
          <span className="bg-up h-[7px] w-[7px] rounded-full" />
          Challenger&apos;s stake is already locked
        </div>
        <div className="ws-inset tnum mb-5 px-4 py-3.5 text-left text-[12.5px]">
          <div className="mb-1.5 flex justify-between">
            <span className="font-normal text-white/50">Your stake</span>
            <span>{fmt(stakeMinor)}</span>
          </div>
          <div className="mb-1.5 flex justify-between">
            <span className="font-normal text-white/50">Participation fee (5%)</span>
            <span className="font-normal text-white/50">−{fmt(feeMinor)}</span>
          </div>
          <div className="flex justify-between">
            <span>Potential winnings</span>
            <span className="text-grey-100">{fmt(potentialMinor)}</span>
          </div>
        </div>
        <Link
          href={`/casino/chess/play?${stakeQuery(stakeMinor, currency, timeControl)}`}
          className="text-ink mb-2.5 block w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5"
        >
          Accept &amp; stake {fmt(stakeMinor)}
        </Link>
        <Link
          href="/casino"
          className="block w-full p-1.5 text-[12.5px] font-normal text-white/50 hover:text-white"
        >
          Decline
        </Link>
      </div>
    </div>
  );
}
