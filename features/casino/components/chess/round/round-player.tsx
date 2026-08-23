"use client";

import type { ReactNode } from "react";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import { RoundClockValue } from "@/features/casino/components/chess/round/round-clock";

interface RoundPlayerBaseProps {
  name: string;
  clockMode: ChessMatch["clockMode"];
  seconds: number;
  live: boolean;
  active: boolean;
  progress: number;
  captured?: ReactNode;
}

function PlayerIdentity({ name, muted = false }: { name: string; muted?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${muted ? "text-white/72" : "text-white/88"}`}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${muted ? "bg-white/28" : "bg-[#6f9827]"}`}
      />
      <div className="ws-chess-lila-player truncate">{name}</div>
    </div>
  );
}

function ClockProgress({ progress, active }: { progress: number; active: boolean }) {
  return (
    <div className="h-[4px] bg-[#3b3936]">
      <div
        className={`h-full origin-left transition-transform duration-200 ${
          active ? "bg-[#7da635]" : "bg-[#5f625c]"
        }`}
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

export function RoundTablePlayer({
  name,
  clockMode,
  seconds,
  live,
  active,
  progress,
  captured,
  position,
}: RoundPlayerBaseProps & { position: "top" | "bottom" }) {
  const clock = (
    <div className="flex justify-start">
      <div
        className={`px-[15px] shadow-[0_2px_5px_rgba(0,0,0,0.28)] ${
          position === "top" ? "rounded-tr-[2px]" : "rounded-br-[2px]"
        } ${active ? "bg-[#384a25]" : "bg-[#262421]"}`}
      >
        <RoundClockValue mode={clockMode} seconds={seconds} live={live} active={active} />
      </div>
    </div>
  );
  const identity = (
    <div className="bg-[#262421] py-[0.5em] pr-[0.5em] pl-[0.3em]">
      <PlayerIdentity name={name} muted={!active} />
    </div>
  );
  const material = captured ? (
    <div className="flex h-10 items-center px-[0.3em]">{captured}</div>
  ) : null;

  return position === "top" ? (
    <div className="shrink-0 border-b border-[#3b3936]">
      {material}
      {clock}
      <ClockProgress progress={progress} active={active} />
      {identity}
    </div>
  ) : (
    <div className="shrink-0 border-t border-[#3b3936]">
      {identity}
      <ClockProgress progress={progress} active={active} />
      {clock}
      {material}
    </div>
  );
}

export function RoundMobilePlayer({
  name,
  seatLabel,
  clockMode,
  seconds,
  live,
  active,
  captured,
}: Omit<RoundPlayerBaseProps, "progress"> & { seatLabel: string }) {
  return (
    <div className={`ws-chess-round-mobile-player py-2 ${active ? "text-white" : "text-white/76"}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="mb-0.5 text-[10px] font-semibold tracking-[0.08em] text-white/32 uppercase">
            {seatLabel}
          </div>
          <PlayerIdentity name={name} muted={!active} />
          {captured ? <div className="mt-1 pl-[18px]">{captured}</div> : null}
        </div>
        <RoundClockValue mode={clockMode} seconds={seconds} live={live} active={active} compact />
      </div>
    </div>
  );
}

export function RoundDialogPlayer({
  name,
  seatLabel,
  clockMode,
  seconds,
  live,
  active,
}: Omit<RoundPlayerBaseProps, "progress" | "captured"> & { seatLabel: string }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-black/12 px-4 py-4">
      <div className="mb-2 text-[11px] tracking-[0.06em] text-white/34 uppercase">{seatLabel}</div>
      <div className="truncate text-[17px] font-semibold text-white">{name}</div>
      <RoundClockValue
        mode={clockMode}
        seconds={seconds}
        live={live}
        active={active}
        compact
        className="mt-3 !text-[38px] !font-light"
      />
    </div>
  );
}
