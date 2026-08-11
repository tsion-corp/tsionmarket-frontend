"use client";

import { memo, useMemo, useState } from "react";
import {
  DEFAULT_DRAUGHTS_THEME,
  type DraughtsBoardTheme,
} from "@/features/casino/lib/draughts/board-theme";
import {
  fieldToRc,
  rcToField,
  type DraughtsBoard,
  type DraughtsSide,
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

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

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
function serialize(board: DraughtsBoard): string {
  let out = "";
  for (let field = 1; field <= 50; field++) {
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

function collect(board: DraughtsBoard): Omit<Placed, "id">[] {
  const cells: Omit<Placed, "id">[] = [];
  for (let field = 1; field <= 50; field++) {
    const piece = board[field];
    if (piece) cells.push({ field, side: piece.side, king: piece.kind === "king" });
  }
  return cells;
}

function initialPlacement(board: DraughtsBoard, serial: string): Placement {
  let nextId = 0;
  const placed = collect(board).map((cell) => ({ id: nextId++, ...cell }));
  return { placed, serial, nextId };
}

// Carry piece identities forward to the new board. A piece on an unchanged
// square keeps its id and does not move. Each remaining arrival adopts the id of
// a vacated piece of the same colour, so it glides from that square; a man that
// was crowned keeps its identity and simply gains the crown. Captured pieces
// fall out of the list.
function reconcile(prev: Placement, board: DraughtsBoard, serial: string): Placement {
  const cells = collect(board);
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
  /** The squares the player has clicked so far, origin first. */
  path?: readonly number[];
  /** Squares the piece may move to next. */
  targets?: readonly number[];
  /** Squares whose pieces have a legal move, hinted when nothing is selected. */
  movable?: readonly number[];
  /** The previous move's path, kept lit until the next one. */
  lastMove?: readonly number[];
  /** Pieces about to be taken by the path in progress. */
  doomed?: readonly number[];
  /** Which side sits at the bottom. */
  orientation?: DraughtsSide;
  theme?: DraughtsBoardTheme;
  /** Omit to render a read-only board. */
  onFieldClick?: (field: number) => void;
}

// Memoized: the play screen re-renders several times a second for the clock, and
// the board only actually changes when a prop does.
export const DraughtsBoardView = memo(function DraughtsBoardView({
  board,
  path = [],
  targets = [],
  movable = [],
  lastMove = [],
  doomed = [],
  orientation = "white",
  theme = DEFAULT_DRAUGHTS_THEME,
  onFieldClick,
}: DraughtsBoardProps) {
  const flipped = orientation === "black";

  const serial = useMemo(() => serialize(board), [board]);
  const [placement, setPlacement] = useState<Placement>(() => initialPlacement(board, serial));
  // Adjusting state during render, guarded by the previous serial: React's
  // pattern for deriving from a changed prop without an effect's extra pass.
  if (placement.serial !== serial) {
    setPlacement(reconcile(placement, board, serial));
  }

  const selected = path.length > 0 ? path[path.length - 1] : null;
  const origin = path.length > 0 ? path[0] : null;

  // Black reads the board from the far side, so both axes flip. The true field
  // number stays on the click handler so a click always names its own square.
  const display = (n: number) => (flipped ? 9 - n : n);
  const rows = flipped ? [...CELLS].reverse() : CELLS;
  const cols = flipped ? [...CELLS].reverse() : CELLS;

  return (
    // The frame of a real set, drawn as padding on a wrapper rather than a
    // border: a percentage scales with the board, and border-width has no
    // relative unit that would. The inner box stays the true board area, so the
    // piece layer's percentage offsets keep lining up with the squares.
    <div
      className="w-full overflow-hidden rounded-[7px]"
      style={{ background: theme.frame, padding: "1.4%" }}
    >
      <div
        className="relative w-full overflow-hidden rounded-[2px]"
        // The query container the pieces size their bevel and grooves against.
        style={{ containerType: "inline-size" }}
      >
        {/* Square layer: colours, highlights, field numbers and click targets. */}
        <div className="grid grid-cols-10">
          {rows.map((row) =>
            cols.map((col) => {
              const field = rcToField(row, col);
              const playable = field !== null;
              const isDark = (row + col) % 2 === 1;

              const isSelected = field !== null && field === selected;
              const isOrigin = field !== null && field === origin;
              const isTarget = field !== null && targets.includes(field);
              const isLast = field !== null && lastMove.includes(field);
              const isDoomed = field !== null && doomed.includes(field);
              const isMovable = field !== null && path.length === 0 && movable.includes(field);

              let background = isDark ? theme.dark : theme.light;
              if (isLast) background = isDark ? theme.darkLast : theme.lightLast;
              if (isOrigin || isSelected) {
                background = isDark ? theme.darkSelected : theme.lightSelected;
              }

              const marker = isDark ? "rgba(244,244,244,0.55)" : "rgba(15,15,15,0.4)";
              const numberColor = isDark ? theme.light : theme.dark;
              const clickable = !!onFieldClick && playable;

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={clickable ? () => onFieldClick(field) : undefined}
                  className={`relative flex aspect-square items-center justify-center ${
                    clickable ? "cursor-pointer" : ""
                  }`}
                  style={{ background, containerType: "size" }}
                >
                  {/* Field numbers only on the playing squares: draughts notation
                    is numeric, so they double as a reading aid. */}
                  {playable ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute leading-none font-medium tabular-nums opacity-25"
                      style={{ color: numberColor, fontSize: "15cqw", left: "7cqw", top: "5cqw" }}
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

                  {/* A quiet hint on the pieces that have a legal move. With a
                    forced capture on the board this is the shortlist, which is
                    how a player learns the rule without being told. */}
                  {isMovable ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-[9%] rounded-full border-2"
                      style={{ borderColor: marker, opacity: 0.5 }}
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
            const { row, col } = fieldToRc(piece.field);
            return (
              <div
                key={piece.id}
                className="absolute top-0 left-0 flex items-center justify-center"
                style={{
                  width: "10%",
                  height: "10%",
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

// The two piece colours. Each is a lit disc: a highlight off the top-left, a
// darker rim, and a drop shadow that lifts it off the square.
const DISC: Record<
  DraughtsSide,
  { face: string; rim: string; crown: string; groove: string; grooveShadow: string }
> = {
  // Ivory and ebony, the two colours a draughts set actually comes in. Both
  // read against every square in the palettes, which red-on-red would not.
  white: {
    face: "radial-gradient(circle at 32% 26%, #fffdf7 0%, #f4eddc 45%, #cdc0a4 100%)",
    rim: "rgba(94,80,56,0.6)",
    crown: "#8a6d2f",
    groove: "rgba(120,102,72,0.3)",
    grooveShadow: "rgba(120,102,72,0.25)",
  },
  black: {
    face: "radial-gradient(circle at 32% 26%, #4a4a52 0%, #26262c 45%, #101014 100%)",
    rim: "rgba(0,0,0,0.7)",
    crown: "#d9b45a",
    groove: "rgba(255,255,255,0.13)",
    grooveShadow: "rgba(0,0,0,0.5)",
  },
};

function Disc({ side, king }: { side: DraughtsSide; king: boolean }) {
  const skin = DISC[side];
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: "78%",
        height: "78%",
        background: skin.face,
        border: `1px solid ${skin.rim}`,
        // Container units so the bevel and the lift scale with the board
        // instead of turning into a smudge on a phone.
        boxShadow: "inset 0 -1.5cqw 2.5cqw rgba(0,0,0,0.3), 0 1cqw 1.6cqw rgba(0,0,0,0.4)",
      }}
    >
      {/* The concentric grooves a real draughts piece is moulded with: a wide
          outer step, then the ring the crown sits inside. Two rings rather than
          one is what reads as a moulded counter instead of a flat dot. */}
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          inset: "9%",
          border: `0.4cqw solid ${skin.groove}`,
          boxShadow: `inset 0 0.35cqw 0.5cqw ${skin.grooveShadow}`,
        }}
      />
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{ inset: "20%", border: `0.35cqw solid ${skin.groove}` }}
      />
      {king ? <Crown color={skin.crown} /> : null}
    </div>
  );
}

// A crown marks a king. Drawn rather than typed so it scales with the board and
// never depends on an emoji font.
function Crown({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="relative"
      style={{ width: "52%", height: "52%" }}
      fill="none"
    >
      <path
        d="M4 17.5h16M4.6 7.2l3.5 3.1L12 5l3.9 5.3 3.5-3.1-1.3 8.3H5.9L4.6 7.2Z"
        fill={color}
        stroke={color}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
