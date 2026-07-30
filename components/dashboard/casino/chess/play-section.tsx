"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { WithdrawModal } from "@/components/dashboard/modals/withdraw-modal";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { useChessMatch } from "@/components/dashboard/casino/chess/use-chess-match";
import { PIECE_GLYPHS } from "@/components/dashboard/casino/chess/piece-art";
import {
  DEMO_OPPONENT,
  DEMO_PLAYER,
  timeControlSeconds,
  type TimeControl,
} from "@/lib/casino/demo";
import { formatCasinoAmount, stakeBreakdown, type CasinoCurrency } from "@/lib/casino/stakes";
import type { PieceColor, PieceType } from "@/lib/casino/chess/engine";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface PlaySectionProps {
  stakeMinor: number;
  currency: CasinoCurrency;
  timeControl: TimeControl;
}

export function PlaySection({ stakeMinor, currency, timeControl }: PlaySectionProps) {
  const { base, increment } = timeControlSeconds(timeControl);
  const match = useChessMatch({ baseSeconds: base, increment });
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { potMinor, potentialMinor } = stakeBreakdown(stakeMinor);
  const fmt = (minor: number) => formatCasinoAmount(minor, currency);

  const capturedLine = (color: PieceColor) =>
    match.captured[color].map((t: PieceType) => PIECE_GLYPHS[t]).join(" ");

  const clockClass = (color: PieceColor) => {
    const active = match.live && match.turn === color;
    const low = match.clocks[color] <= 30;
    return `tnum rounded-lg px-3.5 py-1.5 text-[20px] transition-colors ${
      low
        ? "border border-down/60 bg-white/4 text-down"
        : active
          ? "border border-accent/50 bg-white/6 text-white"
          : "border border-transparent bg-white/4 text-white"
    }`;
  };

  const showOverlay = match.youWon || match.youLost || match.drawn;
  const resultLabel = match.resigned
    ? "Resigned · You lost"
    : match.flagged === "w"
      ? "Flag fall · You lost on time"
      : match.flagged === "b"
        ? "Flag fall · You won on time"
        : match.status === "checkmate"
          ? match.youWon
            ? "Checkmate · You won"
            : "Checkmate · You lost"
          : "Stalemate · Draw";
  const resultColor = match.youWon ? "text-up" : match.drawn ? "text-white/50" : "text-down";
  const resultPayout = match.youWon ? fmt(potentialMinor) : match.drawn ? fmt(stakeMinor) : fmt(0);

  const turnLabel =
    match.status === "checkmate"
      ? "Checkmate"
      : match.status === "stalemate"
        ? "Stalemate"
        : match.status === "check" && match.turn === "w"
          ? "Check — your move"
          : match.turn === "w"
            ? "Your move"
            : "Opponent thinking…";

  let moveListDisplay = "";
  for (let i = 0; i < match.moveList.length; i += 2) {
    const black = match.moveList[i + 1] ? ` ${match.moveList[i + 1]}` : "";
    moveListDisplay += `${i / 2 + 1}. ${match.moveList[i]}${black}  `;
  }
  moveListDisplay = moveListDisplay.trim() || "No moves yet";

  return (
    <div className="relative mx-auto w-full max-w-[560px] px-4 pt-7 pb-20 sm:px-6">
      <div className="ws-display tnum text-grey-100 mb-4 text-center text-[28px]">
        {fmt(potMinor)} pot
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[13.5px]">
          <span className="h-[26px] w-[26px] rounded-full border border-white/10 bg-white/8" />
          <span>
            {DEMO_OPPONENT.name} ({DEMO_OPPONENT.rating})
            <span className="block min-h-[14px] text-[11px] font-normal text-white/50">
              {capturedLine("b")}
            </span>
          </span>
        </div>
        <div className={clockClass("b")}>{formatClock(match.clocks.b)}</div>
      </div>

      <ChessBoard
        board={match.board}
        selected={match.selected}
        legalTargets={match.legalTargets}
        lastMove={match.lastMove}
        onSquareClick={match.clickSquare}
      />

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[13.5px]">
          <span className="border-accent h-[26px] w-[26px] rounded-full border bg-white/8" />
          <span>
            {DEMO_PLAYER.name} ({DEMO_PLAYER.rating})
            <span className="block min-h-[14px] text-[11px] font-normal text-white/50">
              {capturedLine("w")}
            </span>
          </span>
        </div>
        <div className={clockClass("w")}>{formatClock(match.clocks.w)}</div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {/* The strip stays scrolled to the latest move via the rtl overflow trick. */}
        <div className="ws-inset min-w-0 flex-1 truncate rounded-[10px] px-3 py-2 text-left text-[12px] font-normal text-white/70 [direction:rtl]">
          <span className="tnum [direction:ltr] [unicode-bidi:bidi-override]">
            {moveListDisplay}
          </span>
        </div>
        <div
          className={`text-[12px] whitespace-nowrap ${
            match.status === "check" && match.turn === "w" ? "text-down" : "text-white/50"
          }`}
        >
          {turnLabel}
        </div>
        <button
          onClick={match.resign}
          className="border-down/40 text-down cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap"
        >
          Resign
        </button>
      </div>

      {showOverlay ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-black/60 backdrop-blur-md">
          <div className="ws-glass w-[320px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className={`text-[12px] font-semibold tracking-[0.06em] uppercase ${resultColor}`}>
              {resultLabel}
            </div>
            <div className="ws-display tnum text-grey-100 mt-2 text-[34px]">{resultPayout}</div>
            <div className="mt-1 text-[12px] font-normal text-white/50">Payout after 5% fee</div>
            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => setWithdrawOpen(true)}
                className="text-ink flex-1 cursor-pointer rounded-full bg-white px-3 py-3 font-sans text-[13px] font-bold"
              >
                Withdraw
              </button>
              <button
                onClick={match.reset}
                className="flex-1 cursor-pointer rounded-full border border-white/15 px-3 py-3 font-sans text-[13px] font-semibold text-white"
              >
                Rematch same stake
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ModalShell
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        contentKey="chess-withdraw"
      >
        <WithdrawModal onClose={() => setWithdrawOpen(false)} />
      </ModalShell>
    </div>
  );
}
