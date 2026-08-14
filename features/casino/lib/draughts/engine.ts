// Browser-side draughts move generation mirrors the Rust referee in
// apps/chess/src/modules/draughts/rules.rs. The server remains authoritative;
// this module only makes every supported variant playable without a request
// for each square a player selects.

export type DraughtsSide = "white" | "black";
export type DraughtsPieceKind = "man" | "king";
export type DraughtsVariant =
  | "standard"
  | "frisian"
  | "frysk"
  | "antidraughts"
  | "breakthrough"
  | "russian"
  | "brazilian"
  | "from_position";

export interface DraughtsPiece {
  side: DraughtsSide;
  kind: DraughtsPieceKind;
}

// Index zero is unused, so a numbered field indexes the array directly.
export type DraughtsBoard = readonly (DraughtsPiece | null)[];

export interface DraughtsPosition {
  board: DraughtsBoard;
  turn: DraughtsSide;
  variant: DraughtsVariant;
}

export interface DraughtsMove {
  path: readonly number[];
  captured: readonly number[];
  capturedValue: number;
  startsAsKing: boolean;
  promoted: boolean;
}

export const STARTING_FEN = "W:W31-50:B1-20";
export const FRYSK_STARTING_FEN = "W:W46-50:B1-5";
export const RUSSIAN_STARTING_FEN = "W:W21-32:B1-12";
export const BOARD_SIZE = 10;
export const FIELD_COUNT = 50;

export const DRAUGHTS_VARIANTS: readonly DraughtsVariant[] = [
  "standard",
  "frisian",
  "frysk",
  "antidraughts",
  "breakthrough",
  "russian",
  "brazilian",
  "from_position",
];

type CapturePolicy = "maximum" | "any" | "frisian";
type Direction = "upLeft" | "upRight" | "downLeft" | "downRight" | "up" | "down" | "left" | "right";

interface VariantRules {
  size: 8 | 10;
  capturePolicy: CapturePolicy;
  immediatePromotion: boolean;
  frisianCaptures: boolean;
}

const DIAGONALS: readonly Direction[] = ["upLeft", "upRight", "downLeft", "downRight"];
const FRISIAN_CAPTURES: readonly Direction[] = [
  "upLeft",
  "upRight",
  "up",
  "downLeft",
  "downRight",
  "down",
  "left",
  "right",
];

function rulesFor(variant: DraughtsVariant): VariantRules {
  if (variant === "frisian" || variant === "frysk") {
    return {
      size: 10,
      capturePolicy: "frisian",
      immediatePromotion: false,
      frisianCaptures: true,
    };
  }
  if (variant === "russian") {
    return { size: 8, capturePolicy: "any", immediatePromotion: true, frisianCaptures: false };
  }
  if (variant === "brazilian") {
    return {
      size: 8,
      capturePolicy: "maximum",
      immediatePromotion: false,
      frisianCaptures: false,
    };
  }
  return {
    size: 10,
    capturePolicy: "maximum",
    immediatePromotion: false,
    frisianCaptures: false,
  };
}

export function boardSizeForVariant(variant: DraughtsVariant): 8 | 10 {
  return rulesFor(variant).size;
}

export function fieldCountForVariant(variant: DraughtsVariant): 32 | 50 {
  return boardSizeForVariant(variant) === 8 ? 32 : 50;
}

export function startingFenForVariant(variant: DraughtsVariant): string {
  if (variant === "frysk") return FRYSK_STARTING_FEN;
  if (variant === "russian" || variant === "brazilian") return RUSSIAN_STARTING_FEN;
  return STARTING_FEN;
}

export function initialPiecesPerSide(variant: DraughtsVariant): number {
  if (variant === "frysk") return 5;
  if (boardSizeForVariant(variant) === 8) return 12;
  return 20;
}

function fieldsPerRow(size: 8 | 10): number {
  return size / 2;
}

export function isDraughtsVariant(value: unknown): value is DraughtsVariant {
  return typeof value === "string" && DRAUGHTS_VARIANTS.includes(value as DraughtsVariant);
}

export function isField(value: number, variant: DraughtsVariant = "standard"): boolean {
  return Number.isInteger(value) && value >= 1 && value <= fieldCountForVariant(variant);
}

/** Physical row and column of a numbered playable field. */
export function fieldToRc(
  field: number,
  variant: DraughtsVariant = "standard"
): { row: number; col: number } {
  const size = boardSizeForVariant(variant);
  const perRow = fieldsPerRow(size);
  const zero = field - 1;
  const row = Math.floor(zero / perRow);
  const index = zero % perRow;
  return { row, col: row % 2 === 0 ? 1 + index * 2 : index * 2 };
}

/** Numbered field at a physical row and column, or null off the dark squares. */
export function rcToField(
  row: number,
  col: number,
  variant: DraughtsVariant = "standard"
): number | null {
  const size = boardSizeForVariant(variant);
  if (row < 0 || row >= size || col < 0 || col >= size || (row + col) % 2 === 0) return null;
  const index = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  if (!Number.isInteger(index) || index < 0 || index >= fieldsPerRow(size)) return null;
  return row * fieldsPerRow(size) + index + 1;
}

function compactToField(row: number, index: number, size: 8 | 10): number | null {
  const perRow = fieldsPerRow(size);
  if (row < 0 || row >= size || index < 0 || index >= perRow) return null;
  return row * perRow + index + 1;
}

function neighbor(field: number, direction: Direction, variant: DraughtsVariant): number | null {
  const size = boardSizeForVariant(variant);
  const perRow = fieldsPerRow(size);
  const zero = field - 1;
  const row = Math.floor(zero / perRow);
  const index = zero % perRow;
  if (direction === "left") return compactToField(row, index - 1, size);
  if (direction === "right") return compactToField(row, index + 1, size);
  if (direction === "up") return compactToField(row - 2, index, size);
  if (direction === "down") return compactToField(row + 2, index, size);
  const col = row % 2 === 0 ? 1 + index * 2 : index * 2;
  const [dr, dc] =
    direction === "upLeft"
      ? [-1, -1]
      : direction === "upRight"
        ? [-1, 1]
        : direction === "downLeft"
          ? [1, -1]
          : [1, 1];
  return rcToField(row + dr, col + dc, variant);
}

function opposite(direction: Direction): Direction {
  const pairs: Record<Direction, Direction> = {
    upLeft: "downRight",
    upRight: "downLeft",
    downLeft: "upRight",
    downRight: "upLeft",
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };
  return pairs[direction];
}

function emptyBoard(variant: DraughtsVariant): (DraughtsPiece | null)[] {
  return new Array<DraughtsPiece | null>(fieldCountForVariant(variant) + 1).fill(null);
}

function pieceAt(board: DraughtsBoard, field: number): DraughtsPiece | null {
  return board[field] ?? null;
}

function fieldsOf(board: DraughtsBoard, side: DraughtsSide): number[] {
  const fields: number[] = [];
  for (let field = 1; field < board.length; field++) {
    if (board[field]?.side === side) fields.push(field);
  }
  return fields;
}

export class DraughtsFenError extends Error {}

function parseField(value: string, variant: DraughtsVariant): number {
  const field = Number(value.trim());
  if (!isField(field, variant)) throw new DraughtsFenError(`invalid draughts field: ${value}`);
  return field;
}

function parsePieceList(
  board: (DraughtsPiece | null)[],
  segment: string,
  side: DraughtsSide,
  variant: DraughtsVariant
): void {
  const trimmed = segment.trim();
  const prefix = side === "white" ? "W" : "B";
  if (!trimmed.startsWith(prefix)) {
    throw new DraughtsFenError(`invalid draughts fen piece list: ${segment}`);
  }
  const body = trimmed.slice(1);
  if (!body) return;
  for (const token of body.split(",").map((part) => part.trim())) {
    if (!token) continue;
    const kind: DraughtsPieceKind = token.startsWith("K") ? "king" : "man";
    const text = kind === "king" ? token.slice(1) : token;
    const [startText, endText] = text.split("-");
    const start = parseField(startText, variant);
    const end = endText ? parseField(endText, variant) : start;
    for (let field = Math.min(start, end); field <= Math.max(start, end); field++) {
      if (board[field]) throw new DraughtsFenError("draughts fen contains overlapping pieces");
      board[field] = { side, kind };
    }
  }
}

export function parseFen(fen: string, variant: DraughtsVariant = "standard"): DraughtsPosition {
  const parts = fen.split(":");
  const side = parts[0]?.trim().toUpperCase();
  if ((side !== "W" && side !== "B") || parts.length < 3) {
    throw new DraughtsFenError(`invalid draughts fen: ${fen}`);
  }
  const board = emptyBoard(variant);
  parsePieceList(board, parts[1], "white", variant);
  parsePieceList(board, parts[2], "black", variant);
  return { board, turn: side === "W" ? "white" : "black", variant };
}

function exportPieceList(board: DraughtsBoard, side: DraughtsSide): string {
  const kings: string[] = [];
  const men: string[] = [];
  for (let field = 1; field < board.length; field++) {
    const piece = board[field];
    if (piece?.side !== side) continue;
    if (piece.kind === "king") kings.push(`K${field}`);
    else men.push(String(field));
  }
  return [side === "white" ? "W" : "B", ...kings, ...men].join(",");
}

export function exportFen(position: DraughtsPosition): string {
  const side = position.turn === "white" ? "W" : "B";
  return `${side}:${exportPieceList(position.board, "white")}:${exportPieceList(position.board, "black")}`;
}

function promotable(field: number, side: DraughtsSide, variant: DraughtsVariant): boolean {
  const row = fieldToRc(field, variant).row;
  const size = boardSizeForVariant(variant);
  return side === "white" ? row === 0 : row === size - 1;
}

function captureValue(piece: DraughtsPiece, rules: VariantRules): number {
  if (rules.capturePolicy !== "frisian") return 1;
  return piece.kind === "king" ? 199 : 100;
}

interface CaptureState {
  board: DraughtsBoard;
  from: number;
  piece: DraughtsPiece;
  variant: DraughtsVariant;
  lastDirection: Direction | null;
  path: number[];
  captured: number[];
  blocked: Set<number>;
  capturedValue: number;
  promoted: boolean;
  startsAsKing: boolean;
}

function manCaptures(state: CaptureState): DraughtsMove[] {
  const rules = rulesFor(state.variant);
  const moves: DraughtsMove[] = [];
  const directions = rules.frisianCaptures ? FRISIAN_CAPTURES : DIAGONALS;
  for (const direction of directions) {
    if (state.lastDirection && opposite(state.lastDirection) === direction) continue;
    const jumped = neighbor(state.from, direction, state.variant);
    const land = jumped === null ? null : neighbor(jumped, direction, state.variant);
    if (jumped === null || land === null) continue;
    const taken = pieceAt(state.board, jumped);
    if (
      !taken ||
      taken.side === state.piece.side ||
      state.blocked.has(jumped) ||
      pieceAt(state.board, land)
    ) {
      continue;
    }

    const board = state.board.slice();
    board[state.from] = null;
    const nowPromoted =
      rules.immediatePromotion &&
      state.piece.kind === "man" &&
      promotable(land, state.piece.side, state.variant);
    const movingPiece: DraughtsPiece = nowPromoted
      ? { side: state.piece.side, kind: "king" }
      : state.piece;
    board[land] = movingPiece;
    const path = [...state.path, land];
    const captured = [...state.captured, jumped];
    const blocked = new Set(state.blocked).add(jumped);
    const value = state.capturedValue + captureValue(taken, rules);
    const next: CaptureState = {
      board,
      from: land,
      piece: movingPiece,
      variant: state.variant,
      lastDirection: direction,
      path,
      captured,
      blocked,
      capturedValue: value,
      promoted: state.promoted || nowPromoted,
      startsAsKing: state.startsAsKing,
    };
    const more = movingPiece.kind === "king" ? kingCaptures(next) : manCaptures(next);
    if (more.length > 0) moves.push(...more);
    else {
      moves.push({
        path,
        captured,
        capturedValue: value,
        startsAsKing: state.startsAsKing,
        promoted:
          state.promoted || nowPromoted || promotable(land, state.piece.side, state.variant),
      });
    }
  }
  return moves;
}

function kingCaptures(state: CaptureState): DraughtsMove[] {
  const rules = rulesFor(state.variant);
  const moves: DraughtsMove[] = [];
  const directions = rules.frisianCaptures ? FRISIAN_CAPTURES : DIAGONALS;
  for (const direction of directions) {
    if (state.lastDirection && opposite(state.lastDirection) === direction) continue;
    let cursor = state.from;
    let enemy: { field: number; piece: DraughtsPiece } | null = null;
    for (;;) {
      const square = neighbor(cursor, direction, state.variant);
      if (square === null || state.blocked.has(square)) break;
      const occupant = pieceAt(state.board, square);
      if (!occupant && !enemy) {
        cursor = square;
        continue;
      }
      if (occupant && !enemy && occupant.side !== state.piece.side) {
        enemy = { field: square, piece: occupant };
        cursor = square;
        continue;
      }
      if (!occupant && enemy) {
        const board = state.board.slice();
        board[state.from] = null;
        board[square] = state.piece;
        const path = [...state.path, square];
        const captured = [...state.captured, enemy.field];
        const blocked = new Set(state.blocked).add(enemy.field);
        const value = state.capturedValue + captureValue(enemy.piece, rules);
        const more = kingCaptures({
          ...state,
          board,
          from: square,
          lastDirection: direction,
          path,
          captured,
          blocked,
          capturedValue: value,
        });
        if (more.length > 0) moves.push(...more);
        else {
          moves.push({
            path,
            captured,
            capturedValue: value,
            startsAsKing: state.startsAsKing,
            promoted: state.promoted,
          });
        }
        cursor = square;
        continue;
      }
      break;
    }
  }
  return moves;
}

function quietMoves(
  board: DraughtsBoard,
  from: number,
  piece: DraughtsPiece,
  variant: DraughtsVariant
): DraughtsMove[] {
  const directions =
    piece.kind === "man"
      ? piece.side === "white"
        ? (["upLeft", "upRight"] as const)
        : (["downLeft", "downRight"] as const)
      : DIAGONALS;
  const moves: DraughtsMove[] = [];
  for (const direction of directions) {
    let cursor = from;
    for (;;) {
      const to = neighbor(cursor, direction, variant);
      if (to === null || pieceAt(board, to)) break;
      moves.push({
        path: [from, to],
        captured: [],
        capturedValue: 0,
        startsAsKing: piece.kind === "king",
        promoted: piece.kind === "man" && promotable(to, piece.side, variant),
      });
      if (piece.kind === "man") break;
      cursor = to;
    }
  }
  return moves;
}

function selectCaptures(moves: DraughtsMove[], policy: CapturePolicy): DraughtsMove[] {
  if (policy === "any") return moves;
  if (policy === "maximum") {
    const maximum = Math.max(...moves.map((move) => move.captured.length));
    return moves.filter((move) => move.captured.length === maximum);
  }
  const maximum = Math.max(...moves.map((move) => move.capturedValue));
  const valued = moves.filter((move) => move.capturedValue === maximum);
  return valued.some((move) => move.startsAsKing)
    ? valued.filter((move) => move.startsAsKing)
    : valued;
}

export function legalMoves(position: DraughtsPosition): DraughtsMove[] {
  const rules = rulesFor(position.variant);
  const captures: DraughtsMove[] = [];
  for (const field of fieldsOf(position.board, position.turn)) {
    const piece = pieceAt(position.board, field);
    if (!piece) continue;
    const state: CaptureState = {
      board: position.board,
      from: field,
      piece,
      variant: position.variant,
      lastDirection: null,
      path: [field],
      captured: [],
      blocked: new Set<number>(),
      capturedValue: 0,
      promoted: false,
      startsAsKing: piece.kind === "king",
    };
    captures.push(...(piece.kind === "king" ? kingCaptures(state) : manCaptures(state)));
  }
  if (captures.length > 0) return selectCaptures(captures, rules.capturePolicy);
  return fieldsOf(position.board, position.turn).flatMap((field) => {
    const piece = pieceAt(position.board, field);
    return piece ? quietMoves(position.board, field, piece, position.variant) : [];
  });
}

export function applyMove(position: DraughtsPosition, move: DraughtsMove): DraughtsPosition {
  const from = move.path[0];
  const to = move.path.at(-1);
  const piece = pieceAt(position.board, from);
  if (!piece || to === undefined) throw new Error(`no piece on origin square ${from}`);
  const board = position.board.slice();
  board[from] = null;
  for (const field of move.captured) board[field] = null;
  board[to] = piece.kind === "man" && move.promoted ? { ...piece, kind: "king" } : piece;
  return {
    board,
    turn: piece.side === "white" ? "black" : "white",
    variant: position.variant,
  };
}

export function moveToSan(move: Pick<DraughtsMove, "path" | "captured">): string {
  return move.path.join(move.captured.length > 0 ? "x" : "-");
}

export function moveToUci(move: { path: readonly number[]; captured?: readonly number[] }): string {
  return move.path.map((field) => String(field).padStart(2, "0")).join("");
}

export function parseUci(uci: string, variant: DraughtsVariant = "standard"): number[] | null {
  const digits = uci.replace(/\D/gu, "");
  if (digits.length < 4 || digits.length % 2 !== 0) return null;
  const path: number[] = [];
  for (let index = 0; index < digits.length; index += 2) {
    const field = Number(digits.slice(index, index + 2));
    if (!isField(field, variant)) return null;
    path.push(field);
  }
  return path;
}

function startsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((field, index) => path[index] === field);
}

export function movesFromPrefix(moves: readonly DraughtsMove[], prefix: readonly number[]) {
  return moves.filter((move) => startsWith(move.path, prefix));
}

export function nextTargets(moves: readonly DraughtsMove[], prefix: readonly number[]): number[] {
  const targets = new Set<number>();
  for (const move of movesFromPrefix(moves, prefix)) {
    const next = move.path[prefix.length];
    if (next !== undefined) targets.add(next);
  }
  return [...targets];
}

export function completedMove(
  moves: readonly DraughtsMove[],
  path: readonly number[]
): DraughtsMove | null {
  if (path.length < 2) return null;
  return (
    moves.find((move) => move.path.length === path.length && startsWith(move.path, path)) ?? null
  );
}

export function movableFields(moves: readonly DraughtsMove[]): number[] {
  return [...new Set(moves.map((move) => move.path[0]))];
}

export function capturedCounts(
  board: DraughtsBoard,
  variant: DraughtsVariant = board.length === 33 ? "russian" : "standard"
): Record<DraughtsSide, number> {
  const remaining: Record<DraughtsSide, number> = { white: 0, black: 0 };
  for (let field = 1; field < board.length; field++) {
    const piece = board[field];
    if (piece) remaining[piece.side] += 1;
  }
  const initial = initialPiecesPerSide(variant);
  return { white: initial - remaining.white, black: initial - remaining.black };
}
