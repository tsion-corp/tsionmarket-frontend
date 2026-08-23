"use client";

import { useEffect, useRef } from "react";

export interface RoundMove {
  ply: number;
  san: string;
}

export interface RoundMovePair {
  turn: number;
  white: RoundMove | null;
  black: RoundMove | null;
}

export function buildMovePairs(moves: readonly RoundMove[]): RoundMovePair[] {
  return moves.reduce<RoundMovePair[]>((pairs, move, index) => {
    if (index % 2 === 0) {
      pairs.push({
        turn: Math.floor(index / 2) + 1,
        white: move,
        black: null,
      });
    } else {
      const pair = pairs[pairs.length - 1];
      if (pair) pair.black = move;
    }
    return pairs;
  }, []);
}

function replayButtonClass(disabled: boolean): string {
  return `flex h-full w-full items-center justify-center bg-transparent text-[1.35em] leading-none transition-colors ${
    disabled
      ? "cursor-not-allowed text-white/15"
      : "cursor-pointer text-white/55 hover:bg-white/[0.06] hover:text-white"
  }`;
}

function moveButtonClass(active: boolean): string {
  return active
    ? "bg-[#30465a] font-semibold text-white"
    : "text-white/72 hover:bg-white/[0.05] hover:text-white";
}

const MOVE_PIECE_GLYPHS: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
};

export function splitMoveNotation(san: string): { glyph: string | null; notation: string } {
  const glyph = MOVE_PIECE_GLYPHS[san.charAt(0)] ?? null;
  return { glyph, notation: glyph ? san.slice(1) : san };
}

export function RoundReplayControls({
  viewingPly,
  currentPly,
  exactReplay,
  onSelect,
  menuOpen,
  onToggleMenu,
  onAnalysis,
}: {
  viewingPly: number;
  currentPly: number;
  exactReplay: boolean;
  onSelect: (ply: number) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onAnalysis: () => void;
}) {
  const startDisabled = viewingPly === 0 || (!exactReplay && currentPly !== 0);
  const previousDisabled = viewingPly === 0 || (!exactReplay && viewingPly - 1 !== currentPly);
  const nextDisabled = viewingPly === currentPly || (!exactReplay && viewingPly + 1 !== currentPly);
  const liveDisabled = viewingPly === currentPly;

  return (
    <div className="h-[2.5rem] border-b border-[#3b3936] bg-[#2b2926]">
      <div className="grid h-full grid-cols-6 items-stretch">
        <button
          type="button"
          onClick={onAnalysis}
          className={replayButtonClass(false)}
          aria-label="Analysis board"
        >
          ♞
        </button>
        <button
          type="button"
          onClick={() => onSelect(0)}
          disabled={startDisabled}
          className={replayButtonClass(startDisabled)}
          aria-label="Start"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => onSelect(viewingPly - 1)}
          disabled={previousDisabled}
          className={replayButtonClass(previousDisabled)}
          aria-label="Previous move"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => onSelect(viewingPly + 1)}
          disabled={nextDisabled}
          className={replayButtonClass(nextDisabled)}
          aria-label="Next move"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentPly)}
          disabled={liveDisabled}
          className={replayButtonClass(liveDisabled)}
          aria-label="Live position"
        >
          »
        </button>
        <button
          type="button"
          onClick={onToggleMenu}
          className={`flex h-full w-full cursor-pointer items-center justify-center text-[1.35em] leading-none transition-colors ${
            menuOpen
              ? "bg-white/[0.08] text-white"
              : "text-white/48 hover:bg-white/[0.06] hover:text-white"
          }`}
          aria-label="Board menu"
          aria-expanded={menuOpen}
        >
          ≡
        </button>
      </div>
    </div>
  );
}

function MoveButton({
  move,
  active,
  disabled,
  compact,
  activeRef,
  onSelect,
}: {
  move: RoundMove;
  active: boolean;
  disabled: boolean;
  compact: boolean;
  activeRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (ply: number) => void;
}) {
  const { glyph, notation } = splitMoveNotation(move.san);

  return (
    <button
      ref={active ? activeRef : null}
      type="button"
      onClick={() => onSelect(move.ply)}
      disabled={disabled}
      className={`tnum min-w-0 text-left transition-colors ${
        compact ? "rounded-[8px] px-2 py-1 font-medium" : "py-0 pl-[0.7em]"
      } ${moveButtonClass(active)} ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <span className="flex min-w-0 items-center gap-[0.12em]">
        {glyph ? (
          <>
            <span aria-hidden className="shrink-0 text-[1.15em] leading-none">
              {glyph}
            </span>
            <span className="sr-only">{move.san.charAt(0)}</span>
          </>
        ) : null}
        <span className="block min-w-0 truncate">{notation}</span>
      </span>
    </button>
  );
}

export function RoundMoveList({
  pairs,
  viewingPly,
  currentPly,
  exactReplay,
  onSelect,
  compact = false,
  emptyLabel = "Starting position",
}: {
  pairs: readonly RoundMovePair[];
  viewingPly: number;
  currentPly: number;
  exactReplay: boolean;
  onSelect: (ply: number) => void;
  compact?: boolean;
  emptyLabel?: string;
}) {
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [viewingPly]);

  if (pairs.length === 0) {
    return <div className="px-4 py-4 text-[14px] text-white/58">{emptyLabel}</div>;
  }

  return (
    <div className={`${compact ? "max-h-[360px]" : "ws-chess-lila-moves min-h-0"} overflow-y-auto`}>
      {pairs.map((row) => (
        <div
          key={`${row.turn}-${row.white?.san ?? ""}-${row.black?.san ?? ""}`}
          className={
            compact
              ? "grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1 border-b border-white/8 px-3 py-1.5 text-[13px] last:border-b-0"
              : "grid grid-cols-[16.666%_41.666%_41.666%] items-stretch"
          }
        >
          <div
            className={`tnum ${
              compact
                ? "text-white/36"
                : "flex items-end justify-center bg-black/10 px-1 py-1.5 text-white/32"
            }`}
          >
            {row.turn}
          </div>
          {row.white ? (
            <MoveButton
              move={row.white}
              active={viewingPly === row.white.ply}
              disabled={!exactReplay && row.white.ply !== currentPly}
              compact={compact}
              activeRef={activeMoveRef}
              onSelect={onSelect}
            />
          ) : (
            <span />
          )}
          {row.black ? (
            <MoveButton
              move={row.black}
              active={viewingPly === row.black.ply}
              disabled={!exactReplay && row.black.ply !== currentPly}
              compact={compact}
              activeRef={activeMoveRef}
              onSelect={onSelect}
            />
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}
