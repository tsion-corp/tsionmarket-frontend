"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_OPPONENT, type TimeControl } from "@/lib/casino/demo";
import { formatCasinoAmount, type CasinoCurrency } from "@/lib/casino/stakes";
import { stakeQuery } from "@/lib/casino/stake-params";

// How long the fake search runs before an opponent turns up, and how long
// they wait for the player to accept before the search restarts.
const SEARCH_MS = 6_000;
const ACCEPT_WINDOW_S = 300;

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface MatchmakingSectionProps {
  stakeMinor: number;
  currency: CasinoCurrency;
  timeControl: TimeControl;
}

export function MatchmakingSection({ stakeMinor, currency, timeControl }: MatchmakingSectionProps) {
  const [phase, setPhase] = useState<"searching" | "found">("searching");
  const [acceptLeft, setAcceptLeft] = useState(ACCEPT_WINDOW_S);

  const stakeLabel = formatCasinoAmount(stakeMinor, currency);

  // Search, find, and if the offer expires go back to searching.
  useEffect(() => {
    if (phase === "searching") {
      const id = setTimeout(() => {
        setAcceptLeft(ACCEPT_WINDOW_S);
        setPhase("found");
      }, SEARCH_MS);
      return () => clearTimeout(id);
    }
    const id = setInterval(() => {
      setAcceptLeft((s) => {
        if (s <= 1) {
          setPhase("searching");
          return ACCEPT_WINDOW_S;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20 sm:px-6">
      {phase === "searching" ? (
        <div className="ws-glass rounded-2xl p-9 text-center">
          <div className="border-accent/30 border-t-accent mx-auto mb-5 h-11 w-11 animate-spin rounded-full border-2" />
          <div className="ws-display mb-1.5 text-[19px]">Finding an opponent</div>
          <div className="mb-4.5 text-[12.5px] font-normal text-white/55">
            Stake {stakeLabel} · {timeControl} {timeControl === "10+0" ? "Rapid" : "Blitz"}
          </div>
          <div className="text-[11.5px] font-normal text-white/40">
            You can leave — we&apos;ll notify you the moment you&apos;re matched.
          </div>
        </div>
      ) : (
        <div className="ws-glass border-accent/30 rounded-2xl border p-8 text-center">
          <div className="text-accent mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
            Match found
          </div>
          <div className="mx-auto mb-3 h-13 w-13 rounded-full border border-white/10 bg-white/8" />
          <div className="text-[16px]">{DEMO_OPPONENT.name}</div>
          <div className="mb-4.5 text-[12px] font-normal text-white/50">
            Rating {DEMO_OPPONENT.rating} · Stake {stakeLabel}
          </div>
          <div className="ws-display tnum text-down mb-4 text-[26px]">
            {formatClock(acceptLeft)}
          </div>
          <Link
            href={`/casino/chess/play?${stakeQuery(stakeMinor, currency, timeControl)}`}
            className="text-ink block w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[13.5px] font-bold transition-transform hover:-translate-y-0.5"
          >
            Accept &amp; lock stake
          </Link>
        </div>
      )}
    </div>
  );
}
