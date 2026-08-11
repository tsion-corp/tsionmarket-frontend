"use client";

import { useEffect, useRef, useState } from "react";
import { playCountdownBeep } from "@/features/casino/lib/chess/sound";

const COUNTDOWN_FROM = 10;

// A rocket-launch style countdown over the board for the final seconds of the
// side-to-move's clock: a big red number falling to zero with a robotic beep
// each second. Non-blocking (you still see the board) and skippable — once
// skipped it re-arms only after the clock climbs back out of the danger zone,
// so the next time-scramble still gets its countdown. `secondsLeft` is the live
// remaining time of whichever side is on the move.
export function FinalCountdown({ secondsLeft, live }: { secondsLeft: number; live: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const lastBeep = useRef<number | null>(null);

  // Re-arm once there is comfortable time again (a move reset the clock).
  // Adjusted during render — the compiler forbids a setState-in-effect, and
  // this is the same adjust-on-prop-change pattern useCountdown uses.
  if (dismissed && secondsLeft > COUNTDOWN_FROM) setDismissed(false);

  const active = live && secondsLeft > 0 && secondsLeft <= COUNTDOWN_FROM && !dismissed;
  const n = Math.ceil(secondsLeft);

  useEffect(() => {
    if (!active) {
      lastBeep.current = null;
      return;
    }
    if (lastBeep.current !== n) {
      lastBeep.current = n;
      playCountdownBeep(n);
    }
  }, [active, n]);

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div
        key={n}
        className="ws-final-count text-down text-[96px] leading-none font-semibold drop-shadow-[0_2px_24px_rgba(229,72,77,0.5)]"
      >
        {n}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Skip countdown"
        className="pointer-events-auto absolute top-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-[13px] font-semibold text-white/70 backdrop-blur-sm transition-colors hover:text-white"
      >
        ✕
      </button>
      <style>{`
        @keyframes wsFinalCount {
          0% { transform: scale(1.35); opacity: 0.25; }
          35% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.85; }
        }
        .ws-final-count { animation: wsFinalCount 1s ease-out; }
      `}</style>
    </div>
  );
}
