"use client";

import { BoardThemePicker } from "@/features/casino/components/chess/board-theme-picker";

export function RoundBoardMenu({
  open,
  flipped,
  onFlip,
  onAnalysis,
  onLobby,
}: {
  open: boolean;
  flipped: boolean;
  onFlip: () => void;
  onAnalysis: () => void;
  onLobby: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="Board menu"
      className="absolute inset-x-0 top-[2.5rem] z-30 overflow-hidden rounded-b-[7px] border-t-2 border-[#629924] bg-[#262421] shadow-[0_8px_24px_rgba(0,0,0,0.42)]"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onFlip}
        className="flex w-full cursor-pointer items-center justify-between border-b border-white/10 px-4 py-3 text-left text-[1em] text-white/72 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <span>Flip board</span>
        <span className="text-[1.3em] text-white/45" aria-hidden>
          ⇅
        </span>
      </button>

      <section className="border-b border-white/10 px-4 py-3">
        <div className="mb-2 text-[0.8em] tracking-[0.08em] text-white/38 uppercase">Board</div>
        <BoardThemePicker />
      </section>

      <button
        type="button"
        role="menuitem"
        onClick={onAnalysis}
        className="block w-full cursor-pointer px-4 py-2.5 text-left text-[0.95em] text-white/66 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        Analysis board
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onLobby}
        className="block w-full cursor-pointer px-4 py-2.5 text-left text-[0.95em] text-white/66 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        Back to lobby
      </button>
      <div className="px-4 py-2 text-[0.78em] text-white/30">
        {flipped ? "Opponent view" : "Your view"}
      </div>
    </div>
  );
}
