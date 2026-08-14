"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import {
  boardSizeForVariant,
  fieldCountForVariant,
  fieldToRc,
  rcToField,
  type DraughtsBoard,
  type DraughtsSide,
  type DraughtsVariant,
} from "@/features/casino/lib/draughts/engine";

// Draughts has no piece art to load: a man is a disc and a king is a disc with
// a crown. Drawing them in CSS keeps the board crisp at any size and lets the
// two colours derive from one pair of values, so a theme swap can never leave a
// piece illegible against its square.

// Pieces move the way the chess board's do: each piece is one persistent
// element on an absolute layer, positioned by a transform, and a move is just a
// change to that transform which the browser animates on the GPU. The element
// is never remounted, so a piece glides across a multi-jump instead of blinking
// from one square to the next.
const PIECE_TRANSITION = "transform .32s cubic-bezier(.2, .7, .3, 1)";

// A piece on the board with an identity that survives across positions, so
// React reconciles a moved piece to the same DOM node.
interface Placed {
  id: number;
  field: number;
  side: DraughtsSide;
  king: boolean;
}

interface Placement {
  placed: Placed[];
  serial: string;
  nextId: number;
}

// One character per field, so a re-render with an identical position (a clock
// tick) can be told apart from a real move without comparing objects.
function serialize(board: DraughtsBoard, fieldCount: number): string {
  let out = "";
  for (let field = 1; field <= fieldCount; field++) {
    const piece = board[field];
    out += !piece
      ? "."
      : piece.side === "white"
        ? piece.kind === "king"
          ? "W"
          : "w"
        : piece.kind === "king"
          ? "B"
          : "b";
  }
  return out;
}

function collect(board: DraughtsBoard, fieldCount: number): Omit<Placed, "id">[] {
  const cells: Omit<Placed, "id">[] = [];
  for (let field = 1; field <= fieldCount; field++) {
    const piece = board[field];
    if (piece) cells.push({ field, side: piece.side, king: piece.kind === "king" });
  }
  return cells;
}

function initialPlacement(board: DraughtsBoard, serial: string, fieldCount: number): Placement {
  let nextId = 0;
  const placed = collect(board, fieldCount).map((cell) => ({ id: nextId++, ...cell }));
  return { placed, serial, nextId };
}

// Carry piece identities forward to the new board. A piece on an unchanged
// square keeps its id and does not move. Each remaining arrival adopts the id of
// a vacated piece of the same colour, so it glides from that square; a man that
// was crowned keeps its identity and simply gains the crown. Captured pieces
// fall out of the list.
function reconcile(
  prev: Placement,
  board: DraughtsBoard,
  serial: string,
  fieldCount: number
): Placement {
  const cells = collect(board, fieldCount);
  const old = prev.placed;
  const used = new Array(old.length).fill(false);
  const kept: Placed[] = [];
  const arrivals: Omit<Placed, "id">[] = [];

  for (const cell of cells) {
    const idx = old.findIndex(
      (p, i) => !used[i] && p.field === cell.field && p.side === cell.side && p.king === cell.king
    );
    if (idx >= 0) {
      used[idx] = true;
      kept.push(old[idx]);
    } else {
      arrivals.push(cell);
    }
  }

  let nextId = prev.nextId;
  for (const cell of arrivals) {
    // Prefer a piece of the same colour that is no longer where it was: that is
    // the one that just moved. Matching on colour alone also covers promotion.
    const idx = old.findIndex((p, i) => !used[i] && p.side === cell.side);
    if (idx >= 0) {
      used[idx] = true;
      kept.push({ id: old[idx].id, ...cell });
    } else {
      kept.push({ id: nextId++, ...cell });
    }
  }

  return { placed: kept, serial, nextId };
}

interface DraughtsBoardProps {
  board: DraughtsBoard;
  variant?: DraughtsVariant;
  /** The squares the player has clicked so far, origin first. */
  path?: readonly number[];
  /** Squares the piece may move to next. */
  targets?: readonly number[];
  /** The previous move's path, kept lit until the next one. */
  lastMove?: readonly number[];
  /** Pieces about to be taken by the path in progress. */
  doomed?: readonly number[];
  /** Which side sits at the bottom. */
  orientation?: DraughtsSide;
  /** Omit to render a read-only board. */
  onFieldClick?: (field: number) => void;
}

// Memoized: the play screen re-renders several times a second for the clock, and
// the board only actually changes when a prop does.
export const DraughtsBoardView = memo(function DraughtsBoardView({
  board,
  variant = "standard",
  path = [],
  targets = [],
  lastMove = [],
  doomed = [],
  orientation = "white",
  onFieldClick,
}: DraughtsBoardProps) {
  const flipped = orientation === "black";
  const size = boardSizeForVariant(variant);
  const fieldCount = fieldCountForVariant(variant);
  const cells = useMemo(() => Array.from({ length: size }, (_, index) => index), [size]);

  const serial = useMemo(
    () => `${variant}:${serialize(board, fieldCount)}`,
    [board, fieldCount, variant]
  );
  const [placement, setPlacement] = useState<Placement>(() =>
    initialPlacement(board, serial, fieldCount)
  );
  // Adjusting state during render, guarded by the previous serial: React's
  // pattern for deriving from a changed prop without an effect's extra pass.
  if (placement.serial !== serial) {
    setPlacement(reconcile(placement, board, serial, fieldCount));
  }

  const selected = path.length > 0 ? path[path.length - 1] : null;
  const origin = path.length > 0 ? path[0] : null;

  // Black reads the board from the far side, so both axes flip. The true field
  // number stays on the click handler so a click always names its own square.
  const display = (n: number) => (flipped ? size - 1 - n : n);
  const rows = flipped ? [...cells].reverse() : cells;
  const cols = flipped ? [...cells].reverse() : cells;
  const cellPercent = 100 / size;

  const boardTexture = size === 10 ? "/draughts/board/wood-100.jpg" : "/draughts/board/wood-64.jpg";

  return (
    <div className="relative w-full pr-[2.6%] pb-[3.4%]" style={{ containerType: "inline-size" }}>
      <div
        className="relative aspect-square w-full overflow-visible rounded-[2px] bg-cover shadow-[0_8px_30px_rgba(0,0,0,0.32)]"
        style={{ backgroundImage: `url(${boardTexture})` }}
      >
        {/* Square layer: colours, highlights, field numbers and click targets. */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {rows.map((row) =>
            cols.map((col) => {
              const field = rcToField(row, col, variant);
              const playable = field !== null;
              const isDark = (row + col) % 2 === 1;

              const isSelected = field !== null && field === selected;
              const isOrigin = field !== null && field === origin;
              const isTarget = field !== null && targets.includes(field);
              const isLast = field !== null && lastMove.includes(field);
              const isDoomed = field !== null && doomed.includes(field);
              let background = "transparent";
              if (isLast) background = "rgba(174, 174, 24, 0.44)";
              if (isOrigin || isSelected) background = "rgba(194, 191, 24, 0.58)";

              const marker = isDark ? "rgba(244,244,244,0.55)" : "rgba(15,15,15,0.4)";
              const clickable = !!onFieldClick && playable;
              const edgeNumber = playable && display(col) === size - 1;
              const bottomNumber = playable && display(row) === size - 1;

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={clickable ? () => onFieldClick(field) : undefined}
                  className={`relative flex aspect-square items-center justify-center ${
                    clickable ? "cursor-pointer" : ""
                  }`}
                  style={{ background, containerType: "size" }}
                >
                  {edgeNumber ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 font-sans font-semibold text-white/65 tabular-nums select-none"
                      style={{ fontSize: "17cqw", right: "-28cqw" }}
                    >
                      {field}
                    </span>
                  ) : null}
                  {bottomNumber ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 font-sans font-semibold text-white/65 tabular-nums select-none"
                      style={{ bottom: "-28cqw", fontSize: "17cqw" }}
                    >
                      {field}
                    </span>
                  ) : null}

                  {/* A piece the path in progress will capture, marked before the
                    move is committed so the player sees the cost of the jump. */}
                  {isDoomed ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-[8%] rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle at center, rgba(220,40,40,0.85) 0%, rgba(210,30,30,0.35) 55%, rgba(200,20,20,0) 78%)",
                      }}
                    />
                  ) : null}

                  {isTarget ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute h-[30%] w-[30%] rounded-full"
                      style={{ background: marker }}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Piece layer: persistent elements positioned by transform, so a move
          animates the same node. Below the squares for interaction, so clicks
          fall through to the square handler. */}
        <div className="pointer-events-none absolute inset-0">
          {placement.placed.map((piece) => {
            const { row, col } = fieldToRc(piece.field, variant);
            return (
              <div
                key={piece.id}
                className="absolute top-0 left-0 flex items-center justify-center"
                style={{
                  width: `${cellPercent}%`,
                  height: `${cellPercent}%`,
                  transform: `translate(${display(col) * 100}%, ${display(row) * 100}%)`,
                  transition: PIECE_TRANSITION,
                  willChange: "transform",
                }}
              >
                <Disc side={piece.side} king={piece.king} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function Disc({ side, king }: { side: DraughtsSide; king: boolean }) {
  const file = `${side === "white" ? "w" : "b"}${king ? "K" : "M"}.svg`;
  return (
    // These are Lidraughts' wide set from the supplied source tree. Keeping
    // them as SVG images preserves its raised-counter silhouette at every size.
    <Image
      alt=""
      draggable={false}
      src={`/draughts/pieces/${file}`}
      width={100}
      height={100}
      unoptimized
      className="h-full w-full object-contain select-none"
    />
  );
}
