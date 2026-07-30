"use client";

import type { Board, Move, PieceColor, PieceType, Square } from "@/lib/casino/chess/engine";
import { PIECE_ART } from "@/components/dashboard/casino/chess/piece-art";

// Board palette, taken from the Ark greyscale steps (grey-100..grey-900).
// These are inline styles rather than classes because the square colour is
// data-driven, but every value is a palette step.
const LIGHT_SQ = "#bfbfbf"; // grey-300
const DARK_SQ = "#3c3c3c"; // grey-700
// The last move brightens its two squares one step.
const LIGHT_LAST = "#dcdcdc"; // grey-200
const DARK_LAST = "#5a5a5a"; // grey-600
// The selected piece brightens further, so it reads on either square colour.
const LIGHT_SELECTED = "#f4f4f4"; // grey-100
const DARK_SELECTED = "#7a7a7a"; // grey-500
// Pieces are the two ends of the scale, outlined in the opposite end.
const WHITE_PIECE = "#f4f4f4"; // grey-100
const BLACK_PIECE = "#0f0f0f"; // grey-900

// One piece. The body is filled in the piece's colour and outlined in the
// opposite one so it reads on either square; the detail strokes sit on top in
// the outline colour.
function PieceGlyph({ type, white }: { type: PieceType; white: boolean }) {
  const fill = white ? WHITE_PIECE : BLACK_PIECE;
  const line = white ? BLACK_PIECE : WHITE_PIECE;
  const art = PIECE_ART[type];

  return (
    <svg viewBox="0 0 45 45" className="pointer-events-none h-[84%] w-[84%]">
      <g fill={fill} stroke={line} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {art.body.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {art.detail?.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={line} strokeWidth="1.4" strokeLinecap="round" />
      ))}
    </svg>
  );
}

interface ChessBoardProps {
  board: Board;
  selected?: Square | null;
  legalTargets?: Square[];
  lastMove?: Move | null;
  // Which side sits at the bottom. A player looks at the board from their own
  // side, the way they would across a real one.
  orientation?: PieceColor;
  // Omit to render a read-only board (spectator view).
  onSquareClick?: (r: number, c: number) => void;
}

const FILES = [0, 1, 2, 3, 4, 5, 6, 7];

export function ChessBoard({
  board,
  selected = null,
  legalTargets = [],
  lastMove = null,
  orientation = "w",
  onSquareClick,
}: ChessBoardProps) {
  // Row 0 is black's back rank, so white already looks at the board the right
  // way up. Black reads it from the far side: both ranks and files reverse, and
  // the indices stay the true ones so a click still names the square it hit.
  const flipped = orientation === "b";
  const ranks = flipped ? [...FILES].reverse() : FILES;
  const files = flipped ? [...FILES].reverse() : FILES;

  return (
    // Each square carries its own aspect rather than the board carrying one, so
    // all 64 stay identical whether or not a piece sits on them.
    <div className="grid w-full grid-cols-8 overflow-hidden rounded-md border border-white/10">
      {ranks.map((r) =>
        files.map((c) => {
          const piece = board[r][c];
          const isDark = (r + c) % 2 === 1;
          const isSelected = selected?.r === r && selected?.c === c;
          const isTarget = legalTargets.some((t) => t.r === r && t.c === c);
          const isLast =
            !!lastMove &&
            ((lastMove.from.r === r && lastMove.from.c === c) ||
              (lastMove.to.r === r && lastMove.to.c === c));

          let background = isDark ? DARK_SQ : LIGHT_SQ;
          if (isLast) background = isDark ? DARK_LAST : LIGHT_LAST;
          if (isSelected) background = isDark ? DARK_SELECTED : LIGHT_SELECTED;

          // A monochrome board can't signal legal moves with hue, so they get
          // the usual chess affordance instead: a dot on an empty square, a
          // ring around a piece that can be captured. Contrast flips with the
          // square so the marker stays visible on both.
          const marker = isDark ? "rgba(244,244,244,0.55)" : "rgba(15,15,15,0.4)";

          return (
            <div
              key={`${r}-${c}`}
              onClick={onSquareClick ? () => onSquareClick(r, c) : undefined}
              className={`relative flex aspect-square items-center justify-center ${
                onSquareClick ? "cursor-pointer" : ""
              }`}
              style={{ background }}
            >
              {piece ? <PieceGlyph type={piece.type} white={piece.color === "w"} /> : null}
              {isTarget ? (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute rounded-full ${
                    piece ? "inset-[6%] border-[3px]" : "h-[28%] w-[28%] border-[0px]"
                  }`}
                  style={piece ? { borderColor: marker } : { background: marker }}
                />
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
