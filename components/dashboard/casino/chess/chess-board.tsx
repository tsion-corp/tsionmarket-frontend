"use client";

import { useMemo, useState } from "react";
import type { Board, Move, PieceColor, PieceType, Square } from "@/lib/casino/chess/engine";
import { DEFAULT_THEME, type BoardTheme } from "@/lib/casino/chess/board-theme";

// The Cburnett piece set (public/piece/cburnett/). See its NOTICE.txt on
// licensing and how to swap sets.
function pieceSrc(color: PieceColor, type: PieceType): string {
  return `/piece/cburnett/${color}${type}.png`;
}

// The dual drop-shadow is a thin light + dark halo so a piece of either colour
// stays legible on any square shade.
const PIECE_HALO =
  "drop-shadow(0 0 0.6px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(244,244,244,0.4))";

// Pieces move the way chess.com's board does: each piece is one persistent
// element on an absolute layer, positioned by a transform, and a move is just a
// change to that transform which the browser animates on the GPU. The element
// is never remounted, so the same piece glides — and castling, en passant, and
// promotion all animate because each surviving piece keeps its identity.
const PIECE_TRANSITION = "transform .3s cubic-bezier(0, 0, .4, 1)";

// A piece on the board with a stable identity that survives across positions, so
// React reconciles a moved piece to the same DOM node and its transform (not the
// element) is what changes.
interface Placed {
  id: number;
  color: PieceColor;
  type: PieceType;
  r: number;
  c: number;
}

interface Placement {
  placed: Placed[];
  serial: string;
  nextId: number;
  // The primary move between the previous placement and this one, for the
  // last-move square highlight. Null on the first placement and on a multi-move
  // jump in the replay viewer.
  move: Move | null;
}

// One square as two chars: colour+type, or ".." when empty. Joined into a string
// used only to tell whether the position actually changed (a clock tick that
// re-renders the board with an identical position must not re-animate).
function serialize(board: Board): string {
  return board.map((row) => row.map((p) => (p ? `${p.color}${p.type}` : "..")).join("")).join("/");
}

function collect(board: Board): { r: number; c: number; color: PieceColor; type: PieceType }[] {
  const cells: { r: number; c: number; color: PieceColor; type: PieceType }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) cells.push({ r, c, color: piece.color, type: piece.type });
    }
  }
  return cells;
}

function initialPlacement(board: Board, serial: string): Placement {
  let nextId = 0;
  const placed = collect(board).map((cell) => ({ id: nextId++, ...cell }));
  return { placed, serial, nextId, move: null };
}

// Carry piece identities forward from the previous placement to the new board.
// A piece on an unchanged square keeps its id and does not move. Each remaining
// arrival adopts the id of a vacated piece of the same colour (same type first,
// then a pawn for a promotion), so it glides from that square; only genuinely
// new pieces get a fresh id. Captured pieces simply fall out of the list.
function reconcile(prev: Placement, board: Board, serial: string): Placement {
  const cells = collect(board);
  const old = prev.placed;
  const used = new Array(old.length).fill(false);
  const kept: Placed[] = [];
  const arrivals: { r: number; c: number; color: PieceColor; type: PieceType }[] = [];

  for (const cell of cells) {
    const idx = old.findIndex(
      (p, i) =>
        !used[i] &&
        p.r === cell.r &&
        p.c === cell.c &&
        p.color === cell.color &&
        p.type === cell.type
    );
    if (idx >= 0) {
      used[idx] = true;
      kept.push(old[idx]);
    } else {
      arrivals.push(cell);
    }
  }

  // A large change (jumping across replay moves) shouldn't send pieces sliding
  // clear across the board; only animate when it reads as one move (or castling).
  const slide = arrivals.length <= 2;
  let nextId = prev.nextId;
  const moved: { from: Square; to: Square; king: boolean }[] = [];

  for (const cell of arrivals) {
    let idx = -1;
    if (slide) {
      idx = old.findIndex((p, i) => !used[i] && p.color === cell.color && p.type === cell.type);
      if (idx < 0)
        idx = old.findIndex((p, i) => !used[i] && p.color === cell.color && p.type === "p");
    }
    if (idx >= 0) {
      used[idx] = true;
      moved.push({
        from: { r: old[idx].r, c: old[idx].c },
        to: { r: cell.r, c: cell.c },
        king: cell.type === "k",
      });
      kept.push({ id: old[idx].id, color: cell.color, type: cell.type, r: cell.r, c: cell.c });
    } else {
      kept.push({ id: nextId++, ...cell });
    }
  }

  // Prefer the king's move for the highlight, so castling lights the king.
  const primary = moved.find((m) => m.king) ?? moved[0] ?? null;
  return {
    placed: kept,
    serial,
    nextId,
    move: primary ? { from: primary.from, to: primary.to } : null,
  };
}

interface ChessBoardProps {
  board: Board;
  selected?: Square | null;
  legalTargets?: Square[];
  lastMove?: Move | null;
  // The square of a king that is in check, glowed red. Omit for none.
  checkSquare?: Square | null;
  // Which side sits at the bottom. A player looks at the board from their own
  // side, the way they would across a real one.
  orientation?: PieceColor;
  // The square palette. Defaults to the app's grey set, so a board that doesn't
  // opt into the picker looks exactly as it always did.
  theme?: BoardTheme;
  // Omit to render a read-only board (spectator view).
  onSquareClick?: (r: number, c: number) => void;
}

const FILES = [0, 1, 2, 3, 4, 5, 6, 7];

export function ChessBoard({
  board,
  selected = null,
  legalTargets = [],
  lastMove = null,
  checkSquare = null,
  orientation = "w",
  theme = DEFAULT_THEME,
  onSquareClick,
}: ChessBoardProps) {
  const flipped = orientation === "b";

  const serial = useMemo(() => serialize(board), [board]);
  const [placement, setPlacement] = useState<Placement>(() => initialPlacement(board, serial));
  // Adjusting state during render, guarded by the previous serial — React's
  // pattern for deriving from a changed prop without an effect's extra pass. An
  // identical re-render (a clock tick) leaves the placement, so nothing moves.
  if (placement.serial !== serial) {
    setPlacement(reconcile(placement, board, serial));
  }

  // The last move highlights until the next one. An explicit prop wins (the
  // replay viewer knows the exact move); otherwise use the reconciled move.
  const highlight = lastMove ?? placement.move;

  // Display coordinates: black reads the board from the far side, so both axes
  // flip. The true indices stay on the click handler so a click names its square.
  const displayCol = (c: number) => (flipped ? 7 - c : c);
  const displayRow = (r: number) => (flipped ? 7 - r : r);

  const ranks = flipped ? [...FILES].reverse() : FILES;
  const files = flipped ? [...FILES].reverse() : FILES;
  const bottomRank = ranks[ranks.length - 1];
  const leftFile = files[0];

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-white/10">
      {/* Board layer: colours, highlights, coordinates, the check glow, and the
          click targets. One cell per square. */}
      <div className="grid grid-cols-8">
        {ranks.map((r) =>
          files.map((c) => {
            const isDark = (r + c) % 2 === 1;
            const isSelected = selected?.r === r && selected?.c === c;
            const isTarget = legalTargets.some((t) => t.r === r && t.c === c);
            const hasPiece = !!board[r][c];
            const isLast =
              !!highlight &&
              ((highlight.from.r === r && highlight.from.c === c) ||
                (highlight.to.r === r && highlight.to.c === c));
            const isCheck = checkSquare?.r === r && checkSquare?.c === c;

            let background = isDark ? theme.dark : theme.light;
            if (isLast) background = isDark ? theme.darkLast : theme.lightLast;
            if (isSelected) background = isDark ? theme.darkSelected : theme.lightSelected;

            const marker = isDark ? "rgba(244,244,244,0.55)" : "rgba(15,15,15,0.4)";
            const coordColor = isDark ? theme.light : theme.dark;

            return (
              <div
                key={`${r}-${c}`}
                onClick={onSquareClick ? () => onSquareClick(r, c) : undefined}
                className={`relative flex aspect-square items-center justify-center ${
                  onSquareClick ? "cursor-pointer" : ""
                }`}
                style={{ background }}
              >
                {isCheck ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse at center, rgba(220,40,40,0.95) 0%, rgba(210,30,30,0.5) 42%, rgba(200,20,20,0) 72%)",
                    }}
                  />
                ) : null}
                {c === leftFile ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-[2px] left-[3px] text-[9px] leading-none font-semibold tabular-nums sm:text-[10.5px]"
                    style={{ color: coordColor }}
                  >
                    {8 - r}
                  </span>
                ) : null}
                {r === bottomRank ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-[3px] bottom-[1px] text-[9px] leading-none font-semibold sm:text-[10.5px]"
                    style={{ color: coordColor }}
                  >
                    {String.fromCharCode(97 + c)}
                  </span>
                ) : null}
                {isTarget ? (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute rounded-full ${
                      hasPiece ? "inset-[6%] border-[3px]" : "h-[28%] w-[28%] border-[0px]"
                    }`}
                    style={hasPiece ? { borderColor: marker } : { background: marker }}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Piece layer: persistent elements positioned by transform, so a move
          animates the same node. Below the cells for interaction — clicks fall
          through to the board layer. */}
      <div className="pointer-events-none absolute inset-0">
        {placement.placed.map((p) => (
          <div
            key={p.id}
            className="absolute top-0 left-0 flex items-center justify-center"
            style={{
              width: "12.5%",
              height: "12.5%",
              transform: `translate(${displayCol(p.c) * 100}%, ${displayRow(p.r) * 100}%)`,
              transition: PIECE_TRANSITION,
              willChange: "transform",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pieceSrc(p.color, p.type)}
              alt=""
              draggable={false}
              className="h-[90%] w-[90%] select-none"
              style={{ filter: PIECE_HALO }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
