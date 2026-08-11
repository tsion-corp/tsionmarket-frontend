// International draughts rules, ported from the backend's referee
// (apps/chess/src/modules/draughts/rules.rs). The server stays authoritative:
// this engine exists so the board can offer legal targets, walk a player
// through a multi-jump, and reject an impossible click before spending a
// request. Nothing here decides a game.
//
// The port must stay faithful. Where the two disagree the player sees a move
// accepted locally and refused upstream, which reads as a broken board, so the
// square geometry, the forced-capture rule and the promotion row are kept
// identical to the Rust and covered by the same cases its tests use.
//
// Geometry: a 10x10 board where only the dark squares play, numbered 1 to 50
// left to right, top to bottom. Row 0 holds fields 1 to 5 on the odd columns,
// row 1 holds 6 to 10 on the even ones, and so on down the board.

export type DraughtsSide = "white" | "black";
export type DraughtsPieceKind = "man" | "king";

export interface DraughtsPiece {
  side: DraughtsSide;
  kind: DraughtsPieceKind;
}

// Index 0 is unused so a field number indexes the array directly.
export type DraughtsBoard = readonly (DraughtsPiece | null)[];

export interface DraughtsPosition {
  board: DraughtsBoard;
  turn: DraughtsSide;
}

// A complete legal move. `path` is every square the piece occupies, starting
// with its origin, so a quiet move has two entries and a triple jump has four.
// `captured` lists the squares emptied on the way.
export interface DraughtsMove {
  path: readonly number[];
  captured: readonly number[];
}

export const STARTING_FEN = "W:W31-50:B1-20";

export const BOARD_SIZE = 10;
export const FIELD_COUNT = 50;

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

// White men march up the board (toward row 0), black men down it.
const MAN_DIRECTIONS: Record<DraughtsSide, readonly (readonly [number, number])[]> = {
  white: [
    [-1, -1],
    [-1, 1],
  ],
  black: [
    [1, -1],
    [1, 1],
  ],
};

export function isField(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= FIELD_COUNT;
}

/** Row and column (both 0-9) of a numbered field. */
export function fieldToRc(field: number): { row: number; col: number } {
  const zero = field - 1;
  const row = Math.floor(zero / 5);
  const idx = zero % 5;
  return { row, col: row % 2 === 0 ? 1 + idx * 2 : idx * 2 };
}

/** The field on a row/column, or null when the square is off-board or light. */
export function rcToField(row: number, col: number): number | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  // Light squares never play. Dark squares are the ones where row + col is odd.
  if ((row + col) % 2 === 0) return null;
  const idx = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  if (!Number.isInteger(idx) || idx < 0 || idx > 4) return null;
  return row * 5 + idx + 1;
}

function step(field: number, dr: number, dc: number, n: number): number | null {
  const { row, col } = fieldToRc(field);
  return rcToField(row + dr * n, col + dc * n);
}

function emptyBoard(): (DraughtsPiece | null)[] {
  return new Array<DraughtsPiece | null>(FIELD_COUNT + 1).fill(null);
}

function pieceAt(board: DraughtsBoard, field: number): DraughtsPiece | null {
  return board[field] ?? null;
}

function fieldsOf(board: DraughtsBoard, side: DraughtsSide): number[] {
  const out: number[] = [];
  for (let field = 1; field <= FIELD_COUNT; field++) {
    if (board[field]?.side === side) out.push(field);
  }
  return out;
}

export class DraughtsFenError extends Error {}

function parseField(value: string): number {
  const field = Number(value.trim());
  if (!isField(field)) throw new DraughtsFenError(`invalid draughts field: ${value}`);
  return field;
}

// One side's piece list: "W31-50", "B1,2,K3", or a bare "W" for no pieces.
function parsePieceList(
  board: (DraughtsPiece | null)[],
  segment: string,
  side: DraughtsSide
): void {
  const trimmed = segment.trim();
  const prefix = side === "white" ? "W" : "B";
  if (!trimmed.startsWith(prefix)) {
    throw new DraughtsFenError(`invalid draughts fen piece list: ${segment}`);
  }
  const body = trimmed.slice(prefix.length);
  if (!body) return;

  for (const token of body.split(",").map((part) => part.trim())) {
    if (!token) continue;
    const king = token.startsWith("K");
    const kind: DraughtsPieceKind = king ? "king" : "man";
    const text = king ? token.slice(1) : token;
    const dash = text.indexOf("-");
    if (dash > 0) {
      const start = parseField(text.slice(0, dash));
      const end = parseField(text.slice(dash + 1));
      const [from, to] = start <= end ? [start, end] : [end, start];
      for (let field = from; field <= to; field++) board[field] = { side, kind };
    } else {
      board[parseField(text)] = { side, kind };
    }
  }
}

/** Parse a draughts FEN: side to move, then the white and black piece lists. */
export function parseFen(fen: string): DraughtsPosition {
  const parts = fen.split(":");
  const side = parts[0]?.trim().toUpperCase();
  if (side !== "W" && side !== "B") {
    throw new DraughtsFenError(`invalid draughts fen side-to-move: ${fen}`);
  }
  if (parts.length < 3) throw new DraughtsFenError(`invalid draughts fen: ${fen}`);

  const board = emptyBoard();
  parsePieceList(board, parts[1], "white");
  parsePieceList(board, parts[2], "black");
  return { board, turn: side === "W" ? "white" : "black" };
}

function exportPieceList(board: DraughtsBoard, side: DraughtsSide): string {
  const kings: string[] = [];
  const men: string[] = [];
  for (let field = 1; field <= FIELD_COUNT; field++) {
    const piece = board[field];
    if (piece?.side !== side) continue;
    if (piece.kind === "king") kings.push(`K${field}`);
    else men.push(String(field));
  }
  return [side === "white" ? "W" : "B", ...kings, ...men].join(",");
}

/** Serialize a position back to FEN, matching the backend's field order. */
export function exportFen(position: DraughtsPosition): string {
  const side = position.turn === "white" ? "W" : "B";
  return `${side}:${exportPieceList(position.board, "white")}:${exportPieceList(position.board, "black")}`;
}

function isOpposite(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === -b[0] && a[1] === -b[1];
}

// A man jumps in all four directions, one square over an enemy onto the empty
// square behind it, and keeps jumping while it can. Backing out along the
// direction just used is excluded so a sequence cannot undo itself.
function manCaptures(
  board: DraughtsBoard,
  from: number,
  side: DraughtsSide,
  lastDir: readonly [number, number] | null,
  path: number[],
  captured: number[]
): DraughtsMove[] {
  const out: DraughtsMove[] = [];

  for (const dir of DIRECTIONS) {
    if (lastDir && isOpposite(lastDir, dir)) continue;
    const mid = step(from, dir[0], dir[1], 1);
    const land = step(from, dir[0], dir[1], 2);
    if (mid === null || land === null) continue;
    const jumped = pieceAt(board, mid);
    if (!jumped || jumped.side === side || pieceAt(board, land)) continue;

    const next = board.slice();
    next[land] = next[from];
    next[from] = null;
    next[mid] = null;

    const nextPath = [...path, land];
    const nextCaptured = [...captured, mid];
    const more = manCaptures(next, land, side, dir, nextPath, nextCaptured);
    if (more.length === 0) out.push({ path: nextPath, captured: nextCaptured });
    else out.push(...more);
  }

  return out;
}

// A king slides any distance, and captures by sliding onto any empty square
// beyond the first enemy piece in a direction, provided nothing else blocks.
function kingCaptures(
  board: DraughtsBoard,
  from: number,
  side: DraughtsSide,
  lastDir: readonly [number, number] | null,
  path: number[],
  captured: number[]
): DraughtsMove[] {
  const out: DraughtsMove[] = [];

  for (const dir of DIRECTIONS) {
    if (lastDir && isOpposite(lastDir, dir)) continue;
    let distance = 1;
    let enemy: number | null = null;

    for (;;) {
      const square = step(from, dir[0], dir[1], distance);
      if (square === null) break;
      const occupant = pieceAt(board, square);

      if (!occupant && enemy === null) {
        distance += 1;
        continue;
      }
      if (occupant && enemy === null) {
        // Own piece blocks; an enemy becomes the one this slide may take.
        if (occupant.side === side) break;
        enemy = square;
        distance += 1;
        continue;
      }
      if (!occupant && enemy !== null) {
        const next = board.slice();
        next[square] = next[from];
        next[from] = null;
        next[enemy] = null;

        const nextPath = [...path, square];
        const nextCaptured = [...captured, enemy];
        const more = kingCaptures(next, square, side, dir, nextPath, nextCaptured);
        if (more.length === 0) out.push({ path: nextPath, captured: nextCaptured });
        else out.push(...more);

        distance += 1;
        continue;
      }
      // A second piece behind the enemy ends the slide.
      break;
    }
  }

  return out;
}

function manQuietMoves(board: DraughtsBoard, from: number, side: DraughtsSide): DraughtsMove[] {
  const out: DraughtsMove[] = [];
  for (const dir of MAN_DIRECTIONS[side]) {
    const to = step(from, dir[0], dir[1], 1);
    if (to !== null && !pieceAt(board, to)) out.push({ path: [from, to], captured: [] });
  }
  return out;
}

function kingQuietMoves(board: DraughtsBoard, from: number): DraughtsMove[] {
  const out: DraughtsMove[] = [];
  for (const dir of DIRECTIONS) {
    for (let n = 1; ; n++) {
      const to = step(from, dir[0], dir[1], n);
      if (to === null || pieceAt(board, to)) break;
      out.push({ path: [from, to], captured: [] });
    }
  }
  return out;
}

/**
 * Every move the side to move may legally play.
 *
 * International draughts forces captures, and among them forces the longest:
 * if any sequence takes three pieces, only three-piece sequences are legal.
 */
export function legalMoves(position: DraughtsPosition): DraughtsMove[] {
  const { board, turn } = position;
  const captures: DraughtsMove[] = [];

  for (const field of fieldsOf(board, turn)) {
    const piece = board[field];
    if (!piece) continue;
    const found =
      piece.kind === "man"
        ? manCaptures(board, field, turn, null, [field], [])
        : kingCaptures(board, field, turn, null, [field], []);
    captures.push(...found);
  }

  if (captures.length > 0) {
    const longest = captures.reduce((max, move) => Math.max(max, move.captured.length), 0);
    return captures.filter((move) => move.captured.length === longest);
  }

  const quiet: DraughtsMove[] = [];
  for (const field of fieldsOf(board, turn)) {
    const piece = board[field];
    if (!piece) continue;
    quiet.push(
      ...(piece.kind === "man" ? manQuietMoves(board, field, turn) : kingQuietMoves(board, field))
    );
  }
  return quiet;
}

function promotes(field: number, side: DraughtsSide): boolean {
  const { row } = fieldToRc(field);
  return side === "white" ? row === 0 : row === 9;
}

/** The position after a legal move, with promotion applied. */
export function applyMove(position: DraughtsPosition, move: DraughtsMove): DraughtsPosition {
  const from = move.path[0];
  const to = move.path[move.path.length - 1];
  const piece = pieceAt(position.board, from);
  if (!piece) throw new Error(`no piece on origin square ${from}`);

  const board = position.board.slice();
  board[from] = null;
  for (const field of move.captured) board[field] = null;
  board[to] =
    piece.kind === "man" && promotes(to, piece.side) ? { side: piece.side, kind: "king" } : piece;

  return { board, turn: piece.side === "white" ? "black" : "white" };
}

/** The service's move notation: "31-26" for a quiet move, "27x18" for a jump. */
export function moveToSan(move: DraughtsMove): string {
  return move.path.join(move.captured.length > 0 ? "x" : "-");
}

/** The wire encoding: every square in the path as a zero-padded pair of digits. */
export function moveToUci(move: DraughtsMove): string {
  return move.path.map((field) => String(field).padStart(2, "0")).join("");
}

/** Split a UCI string back into its path. Returns null when malformed. */
export function parseUci(uci: string): number[] | null {
  const digits = uci.replace(/\D/gu, "");
  if (digits.length < 4 || digits.length % 2 !== 0) return null;
  const path: number[] = [];
  for (let i = 0; i < digits.length; i += 2) {
    const field = Number(digits.slice(i, i + 2));
    if (!isField(field)) return null;
    path.push(field);
  }
  return path;
}

// Board interaction. A multi-jump is entered one landing square at a time, so
// the board asks what may follow the squares already chosen.

function startsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((field, i) => path[i] === field);
}

/** The moves still reachable once the player has clicked through `prefix`. */
export function movesFromPrefix(moves: readonly DraughtsMove[], prefix: readonly number[]) {
  return moves.filter((move) => startsWith(move.path, prefix));
}

/** The squares a piece may be moved to next, given the path chosen so far. */
export function nextTargets(moves: readonly DraughtsMove[], prefix: readonly number[]): number[] {
  const targets = new Set<number>();
  for (const move of movesFromPrefix(moves, prefix)) {
    const next = move.path[prefix.length];
    if (next !== undefined) targets.add(next);
  }
  return [...targets];
}

/** The move a completed path names, or null while the path is still partial. */
export function completedMove(
  moves: readonly DraughtsMove[],
  path: readonly number[]
): DraughtsMove | null {
  if (path.length < 2) return null;
  return (
    moves.find((move) => move.path.length === path.length && startsWith(move.path, path)) ?? null
  );
}

/** The fields that can start a move, so the board can hint what is playable. */
export function movableFields(moves: readonly DraughtsMove[]): number[] {
  return [...new Set(moves.map((move) => move.path[0]))];
}

/**
 * The pieces each side has lost, derived by comparing a position to the
 * starting one. Used for the captured-piece rows beside the board.
 */
export function capturedCounts(board: DraughtsBoard): Record<DraughtsSide, number> {
  const remaining: Record<DraughtsSide, number> = { white: 0, black: 0 };
  for (let field = 1; field <= FIELD_COUNT; field++) {
    const piece = board[field];
    if (piece) remaining[piece.side] += 1;
  }
  return { white: 20 - remaining.white, black: 20 - remaining.black };
}
