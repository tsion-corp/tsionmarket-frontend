"use client";

import type { ChessMatch } from "@/features/casino/lib/api/types";
import { formatChessClock, lowChessClockClass } from "@/features/casino/lib/chess/clock";

export function formatRoundClock(mode: ChessMatch["clockMode"], totalSeconds: number): string {
  return mode === "unlimited" ? "∞" : formatChessClock(totalSeconds);
}

function formatStoppedRoundClock(mode: ChessMatch["clockMode"], totalSeconds: number): string {
  if (mode === "unlimited") return "∞";
  const whole = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function ClockIcon({ className = "h-[0.62em] w-[0.62em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0 opacity-55`} aria-hidden>
      <path
        fill="currentColor"
        d="M10 0a10 10 0 100 20A10 10 0 0010 0zm0 2.4a7.6 7.6 0 110 15.2 7.6 7.6 0 010-15.2zM8.9 4.8v5.7l4.6 2.7.9-1.6-3.7-2.2V4.8z"
      />
    </svg>
  );
}

export function RoundClockValue({
  mode,
  seconds,
  live,
  active = false,
  compact = false,
  className = "",
}: {
  mode: ChessMatch["clockMode"];
  seconds: number;
  live: boolean;
  active?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const lowClass = lowChessClockClass(seconds, live && active);
  return (
    <div
      className={`ws-chess-lila-clock tnum flex items-center ${
        compact ? "ws-chess-lila-clock-compact gap-1.5" : "ws-chess-lila-clock-main"
      } ${lowClass || (active ? "text-white" : "text-white/88")} ${className}`}
    >
      {compact ? <ClockIcon /> : null}
      {live && active ? formatRoundClock(mode, seconds) : formatStoppedRoundClock(mode, seconds)}
    </div>
  );
}
