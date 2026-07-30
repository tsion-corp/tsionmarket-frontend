"use client";

import { useState } from "react";
import Link from "next/link";
import { TIME_CONTROLS, type TimeControl } from "@/lib/casino/demo";
import {
  formatCasinoAmount,
  parseStakeToMinor,
  stakeBreakdown,
  type CasinoCurrency,
} from "@/lib/casino/stakes";
import { stakeQuery } from "@/lib/casino/stake-params";

const CURRENCIES: CasinoCurrency[] = ["NGN", "USDC", "SOL"];

type CreateMode = "invite" | "auto";

export function CreateSection() {
  const [mode, setMode] = useState<CreateMode>("invite");
  const [stakeInput, setStakeInput] = useState("50000");
  const [currency, setCurrency] = useState<CasinoCurrency>("NGN");
  const [timeControl, setTimeControl] = useState<TimeControl>("5+3");
  const [inviteCreated, setInviteCreated] = useState(false);

  const stakeMinor = parseStakeToMinor(stakeInput);
  const { feeMinor, potentialMinor } = stakeBreakdown(stakeMinor);
  const fmt = (minor: number) => formatCasinoAmount(minor, currency);
  const query = stakeQuery(stakeMinor, currency, timeControl);

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 font-sans text-[13px] transition-colors ${
      active ? "bg-accent text-ink border-accent font-semibold" : "text-white hover:bg-white/6"
    }`;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20 sm:px-6">
      <div className="ws-display mb-6 text-[26px]">Create staked game</div>

      <div className="ws-inset mb-5 flex gap-2 rounded-full p-1">
        <button
          onClick={() => {
            setMode("invite");
            setInviteCreated(false);
          }}
          className={`flex-1 cursor-pointer rounded-full py-2.5 font-sans text-[13px] font-semibold transition-colors ${
            mode === "invite" ? "text-ink bg-white" : "text-white/50"
          }`}
        >
          Invite by link
        </button>
        <button
          onClick={() => setMode("auto")}
          className={`flex-1 cursor-pointer rounded-full py-2.5 font-sans text-[13px] font-semibold transition-colors ${
            mode === "auto" ? "text-ink bg-white" : "text-white/50"
          }`}
        >
          Match me automatically
        </button>
      </div>

      <div className="ws-glass mb-4.5 rounded-2xl p-5.5">
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
          Stake amount
        </div>
        <div className="mb-4.5 flex flex-wrap gap-2.5">
          <input
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="ws-inset tnum focus:border-accent/50 min-w-0 flex-1 rounded-[10px] px-3.5 py-2.5 font-sans text-[20px] text-white outline-none"
          />
          <div className="flex gap-1.5">
            {CURRENCIES.map((c) => (
              <button key={c} onClick={() => setCurrency(c)} className={chipClass(currency === c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
          Time control
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc}
              onClick={() => setTimeControl(tc)}
              className={chipClass(timeControl === tc)}
            >
              {tc}
            </button>
          ))}
        </div>
      </div>

      <div className="ws-glass tnum mb-4.5 rounded-2xl p-5.5 text-[13px]">
        <div className="mb-2 flex justify-between">
          <span className="font-normal text-white/50">Your stake</span>
          <span>{fmt(stakeMinor)}</span>
        </div>
        <div className="mb-2 flex justify-between">
          <span className="font-normal text-white/50">Participation fee (5% of pot)</span>
          <span className="font-normal text-white/50">−{fmt(feeMinor)}</span>
        </div>
        <div className="flex justify-between border-t border-white/8 pt-2.5">
          <span>Potential winnings</span>
          <span className="text-grey-100 text-[17px]">{fmt(potentialMinor)}</span>
        </div>
        <div className="mt-1.5 text-[11px] font-normal text-white/50">
          1% withdrawal fee applies when funds leave the platform.
        </div>
      </div>

      {mode === "invite" && !inviteCreated ? (
        <button
          onClick={() => setInviteCreated(true)}
          disabled={stakeMinor === 0}
          className="text-ink w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Lock stake &amp; get invite link
        </button>
      ) : null}

      {mode === "invite" && inviteCreated ? (
        <div className="border-accent/35 mb-3.5 rounded-[14px] border bg-white/4 px-5 py-4.5">
          <div className="mb-2 text-[12px] font-normal text-white/50">
            Your stake is locked in escrow. Link expires in 24h — your stake auto-returns if no one
            joins.
          </div>
          <div className="flex gap-2">
            <div className="text-accent ws-inset min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-[12px]">
              worldstreet.app/chess/i/kx82mQ
            </div>
            <Link
              href={`/casino/chess/invite?${query}`}
              className="bg-accent text-ink grid cursor-pointer place-items-center rounded-lg px-4 font-sans text-[12px] font-bold"
            >
              Preview
            </Link>
          </div>
        </div>
      ) : null}

      {mode === "auto" ? (
        <Link
          href={`/casino/chess/matchmaking?${query}`}
          className="text-ink block w-full cursor-pointer rounded-full bg-white p-3.5 text-center font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5"
        >
          Lock stake &amp; find opponent
        </Link>
      ) : null}
    </div>
  );
}
