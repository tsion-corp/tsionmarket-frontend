import {
  Chess,
  validateFen,
  type Move as ChessJsMove,
  type Square as ChessJsSquare,
} from "chess.js";

// Frontend chess helpers. The board UI still works in simple row/column
// coordinates, but legal move generation, FEN parsing and optimistic next-state
// projection now route through a full rules engine so castling, en passant and
// promotion stay exact.

export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export type Board = (Piece | null)[][];

export interface Square {
  r: number;
  c: number;
}

export interface Move {
  from: Square;
  to: Square;
  promotion?: PieceType;
}

export type GameStatus = "ongoing" | "check" | "checkmate" | "stalemate";

export interface FenPosition {
  board: Board;
  turn: PieceColor;
  fen: string;
}

const PROMOTION_TYPES = ["q", "r", "b", "n"] as const;

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function opponentOf(color: PieceColor): PieceColor {
  return color === "w" ? "b" : "w";
}

function boardFromChess(chess: Chess): Board {
  return chess
    .board()
    .map((row) =>
      row.map((piece) =>
        piece ? { type: piece.type as PieceType, color: piece.color as PieceColor } : null
      )
    );
}

export function initialBoard(): Board {
  return boardFromChess(new Chess());
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

const SLIDE_DIRS: Record<"r" | "b" | "q", ReadonlyArray<readonly [number, number]>> = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  q: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

const KNIGHT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

const KING_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function squareFromName(name: string): Square | null {
  if (name.length !== 2) return null;
  const c = "abcdefgh".indexOf(name[0] ?? "");
  const r = 8 - Number(name[1]);
  if (c < 0 || !Number.isInteger(r) || r < 0 || r > 7) return null;
  return { r, c };
}

function toChessSquare(square: Square): ChessJsSquare {
  return squareName(square.r, square.c) as ChessJsSquare;
}

function toPromotionType(value: string | undefined): PieceType | undefined {
  return PROMOTION_TYPES.includes(value as (typeof PROMOTION_TYPES)[number])
    ? (value as PieceType)
    : undefined;
}

function moveFromChess(move: ChessJsMove): Move {
  const from = squareFromName(move.from);
  const to = squareFromName(move.to);
  if (!from || !to) {
    throw new Error(`Unexpected move squares: ${move.from} -> ${move.to}`);
  }
  return { from, to, promotion: toPromotionType(move.promotion) };
}

function isFenPosition(value: Board | FenPosition | string): value is FenPosition {
  return typeof value === "object" && !Array.isArray(value) && value !== null && "fen" in value;
}

function chessFromPosition(position: FenPosition | string): Chess {
  return new Chess(typeof position === "string" ? position : position.fen);
}

function uniqueTargets(moves: Move[]): Square[] {
  const seen = new Set<string>();
  const targets: Square[] = [];
  for (const move of moves) {
    const key = `${move.to.r}:${move.to.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(move.to);
  }
  return targets;
}

// Moves a piece could make ignoring whether they leave its own king in check.
function pseudoMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r]?.[c];
  if (!piece) return [];
  const moves: Square[] = [];
  const push = (rr: number, cc: number) => {
    if (inBounds(rr, cc)) moves.push({ r: rr, c: cc });
  };
  if (piece.type === "p") {
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir]?.[c]) {
      push(r + dir, c);
      if (r === startRow && !board[r + 2 * dir]?.[c]) push(r + 2 * dir, c);
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (inBounds(rr, cc)) {
        const target = board[rr]?.[cc];
        if (target && target.color !== piece.color) push(rr, cc);
      }
    }
  } else if (piece.type === "n") {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && (!board[rr]?.[cc] || board[rr][cc]?.color !== piece.color)) {
        push(rr, cc);
      }
    }
  } else if (piece.type === "k") {
    for (const [dr, dc] of KING_OFFSETS) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && (!board[rr]?.[cc] || board[rr][cc]?.color !== piece.color)) {
        push(rr, cc);
      }
    }
  } else {
    for (const [dr, dc] of SLIDE_DIRS[piece.type]) {
      let rr = r + dr;
      let cc = c + dc;
      while (inBounds(rr, cc)) {
        const target = board[rr]?.[cc];
        if (!target) {
          push(rr, cc);
        } else {
          if (target.color !== piece.color) push(rr, cc);
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return moves;
}

export function isSquareAttacked(board: Board, r: number, c: number, byColor: PieceColor): boolean {
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      const piece = board[rr]?.[cc];
      if (!piece || piece.color !== byColor) continue;
      if (piece.type === "p") {
        const dir = piece.color === "w" ? -1 : 1;
        if (rr + dir === r && (cc - 1 === c || cc + 1 === c)) return true;
      } else if (pseudoMoves(board, rr, cc).some((m) => m.r === r && m.c === c)) {
        return true;
      }
    }
  }
  return false;
}

export function kingPos(board: Board, color: PieceColor): Square | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r]?.[c];
      if (piece && piece.type === "k" && piece.color === color) return { r, c };
    }
  }
  return null;
}

export function isInCheck(board: Board, color: PieceColor): boolean {
  const kp = kingPos(board, color);
  if (!kp) return false;
  return isSquareAttacked(board, kp.r, kp.c, opponentOf(color));
}

export function squareName(r: number, c: number): string {
  return "abcdefgh"[c] + String(8 - r);
}

function promotionChoices(from: Square, to: Square, piece: Piece | null): Move[] {
  if (piece?.type !== "p" || (to.r !== 0 && to.r !== 7)) return [{ from, to }];
  return PROMOTION_TYPES.map((promotion) => ({ from, to, promotion }));
}

function manualApplyMove(
  board: Board,
  from: Square,
  to: Square,
  promotion: PieceType = "q"
): Board {
  const next = cloneBoard(board);
  const piece = next[from.r]?.[from.c];
  if (!piece) return next;
  next[to.r][to.c] = { ...piece };
  next[from.r][from.c] = null;
  if (piece.type === "p" && (to.r === 0 || to.r === 7))
    next[to.r][to.c] = { type: promotion, color: piece.color };
  return next;
}

function manualMovesForSquare(board: Board, r: number, c: number): Move[] {
  const piece = board[r]?.[c];
  if (!piece) return [];
  return pseudoMoves(board, r, c).flatMap((to) =>
    promotionChoices({ r, c }, to, piece).filter(
      (move) => !isInCheck(manualApplyMove(board, move.from, move.to, move.promotion), piece.color)
    )
  );
}

// One square as two chars: colour+type, or ".." when empty. This stays a
// minimal placement+turn FEN because a bare board cannot honestly recover
// castling rights, en-passant rights or move counters.
export function formatFen(board: Board, turn: PieceColor): string {
  const placement = board
    .map((row) => {
      let empty = 0;
      let out = "";
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
      }
      if (empty > 0) out += String(empty);
      return out;
    })
    .join("/");

  return `${placement} ${turn} - - 0 1`;
}

// The inverse of toUci, for a move the server described rather than one the
// player just made. Returns null on anything that is not a pair of squares, so
// an unreadable move simply goes unhighlighted.
export function fromUci(uci: string): Move | null {
  if (uci.length < 4) return null;
  const from = squareFromName(uci.slice(0, 2));
  const to = squareFromName(uci.slice(2, 4));
  return from && to ? { from, to, promotion: toPromotionType(uci.slice(4, 5)) } : null;
}

// ----- Server interop -----
//
// The casino server owns the position. The browser renders the server FEN, and
// when it needs legal moves or an optimistic next frame it now derives them
// from the same complete rules model instead of a stripped-down local one.

// Parses a full FEN string. Throws on malformed input rather than rendering a
// half-built board.
export function parseFen(fen: string): FenPosition {
  const valid = validateFen(fen);
  if (!valid.ok) throw new Error(`Malformed FEN: ${valid.error ?? "invalid position"}`);
  const chess = new Chess(fen);
  return { board: boardFromChess(chess), turn: chess.turn() as PieceColor, fen: chess.fen() };
}

export function applyUciToFen(fen: string, uci: string): FenPosition | null {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (from.length !== 2 || to.length !== 2) return null;
  const chess = new Chess(fen);
  try {
    chess.move({ from, to, promotion: toPromotionType(uci.slice(4, 5)) });
  } catch {
    return null;
  }
  return { board: boardFromChess(chess), turn: chess.turn() as PieceColor, fen: chess.fen() };
}

export function applyMove(
  position: Board | FenPosition | string,
  from: Square,
  to: Square,
  promotion: PieceType = "q"
): Board {
  if (typeof position === "string" || isFenPosition(position)) {
    const next = applyUciToFen(
      typeof position === "string" ? position : position.fen,
      toUci(position, from, to, promotion)
    );
    return next
      ? next.board
      : boardFromChess(chessFromPosition(typeof position === "string" ? position : position.fen));
  }
  return manualApplyMove(position, from, to, promotion);
}

export function legalMovesForSquare(
  position: Board | FenPosition | string,
  r: number,
  c: number
): Move[] {
  if (typeof position === "string" || isFenPosition(position)) {
    const chess = chessFromPosition(position);
    try {
      return chess.moves({ verbose: true, square: toChessSquare({ r, c }) }).map(moveFromChess);
    } catch {
      return [];
    }
  }
  return manualMovesForSquare(position, r, c);
}

export function legalMovesForPiece(
  position: Board | FenPosition | string,
  r: number,
  c: number
): Square[] {
  return uniqueTargets(legalMovesForSquare(position, r, c));
}

export function allLegalMoves(position: Board | FenPosition | string, turn?: PieceColor): Move[] {
  if (typeof position === "string" || isFenPosition(position)) {
    return chessFromPosition(position).moves({ verbose: true }).map(moveFromChess);
  }
  const out: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = position[r]?.[c];
      if (piece && piece.color === (turn ?? "w")) {
        out.push(...manualMovesForSquare(position, r, c));
      }
    }
  }
  return out;
}

export function gameStatus(position: Board | FenPosition | string, turn?: PieceColor): GameStatus {
  if (typeof position === "string" || isFenPosition(position)) {
    const chess = chessFromPosition(position);
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
    return chess.isCheck() ? "check" : "ongoing";
  }
  const moves = allLegalMoves(position, turn);
  if (moves.length === 0) return isInCheck(position, turn ?? "w") ? "checkmate" : "stalemate";
  return isInCheck(position, turn ?? "w") ? "check" : "ongoing";
}

// Starting count of each piece per side, and the pawn value used for the
// material score. Kings never leave the board, so their value is 0.
const STARTING_COUNTS: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// Heaviest first, so a captured line reads queen → pawn like a scoreboard.
const CAPTURE_ORDER: readonly PieceType[] = ["q", "r", "b", "n", "p"];

export interface CapturedMaterial {
  // Pieces that have left the board. `w` are white pieces (captured by Black),
  // `b` are black pieces (captured by White).
  w: PieceType[];
  b: PieceType[];
  // Net material in pawns from White's point of view; positive means White is
  // ahead.
  advantage: number;
}

// What each side has captured, read off the board. `advantage` is computed from
// the pieces standing, so it stays exact across promotions; the captured lists
// are a diff against the starting array, which is right in every normal case and
// only misattributes a piece after a promotion — fine for an at-a-glance line.
export function capturedFromBoard(board: Board): CapturedMaterial {
  const remaining: Record<PieceColor, Record<PieceType, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  const material: Record<PieceColor, number> = { w: 0, b: 0 };
  for (const row of board) {
    for (const square of row) {
      if (!square) continue;
      remaining[square.color][square.type] += 1;
      material[square.color] += PIECE_VALUES[square.type];
    }
  }
  const capturedOf = (color: PieceColor): PieceType[] => {
    const gone: PieceType[] = [];
    for (const type of CAPTURE_ORDER) {
      const count = Math.max(0, STARTING_COUNTS[type] - remaining[color][type]);
      for (let i = 0; i < count; i += 1) gone.push(type);
    }
    return gone;
  };
  return { w: capturedOf("w"), b: capturedOf("b"), advantage: material.w - material.b };
}

// Encodes a move the way the server expects it: coordinate notation, with a
// promotion piece appended when a pawn reaches the last rank ("e7e8q").
export function toUci(
  position: Board | FenPosition | string,
  from: Square,
  to: Square,
  promotion: PieceType = "q"
): string {
  const board =
    typeof position === "string"
      ? parseFen(position).board
      : isFenPosition(position)
        ? position.board
        : position;
  const piece = board[from.r]?.[from.c];
  const suffix = piece?.type === "p" && (to.r === 0 || to.r === 7) ? promotion : "";
  return squareName(from.r, from.c) + squareName(to.r, to.c) + suffix;
}
