// Minimal legal chess engine for the casino's staked chess game: standard
// moves, no castling or en passant, auto-queen promotion. Pure logic with no
// framework imports, ported from the approved design's engine.

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
}

export type GameStatus = "ongoing" | "check" | "checkmate" | "stalemate";

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function opponentOf(color: PieceColor): PieceColor {
  return color === "w" ? "b" : "w";
}

export function initialBoard(): Board {
  const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: "b" };
    board[1][c] = { type: "p", color: "b" };
    board[6][c] = { type: "p", color: "w" };
    board[7][c] = { type: back[c], color: "w" };
  }
  return board;
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

// Moves a piece could make ignoring whether they leave its own king in check.
function pseudoMoves(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: Square[] = [];
  const push = (rr: number, cc: number) => {
    if (inBounds(rr, cc)) moves.push({ r: rr, c: cc });
  };
  if (piece.type === "p") {
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      push(r + dir, c);
      if (r === startRow && !board[r + 2 * dir][c]) push(r + 2 * dir, c);
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (inBounds(rr, cc)) {
        const target = board[rr][cc];
        if (target && target.color !== piece.color) push(rr, cc);
      }
    }
  } else if (piece.type === "n") {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && (!board[rr][cc] || board[rr][cc]?.color !== piece.color)) {
        push(rr, cc);
      }
    }
  } else if (piece.type === "k") {
    for (const [dr, dc] of KING_OFFSETS) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && (!board[rr][cc] || board[rr][cc]?.color !== piece.color)) {
        push(rr, cc);
      }
    }
  } else {
    for (const [dr, dc] of SLIDE_DIRS[piece.type]) {
      let rr = r + dr;
      let cc = c + dc;
      while (inBounds(rr, cc)) {
        const target = board[rr][cc];
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
      const piece = board[rr][cc];
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

function kingPos(board: Board, color: PieceColor): Square | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
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

export function applyMove(board: Board, from: Square, to: Square): Board {
  const next = cloneBoard(board);
  const piece = next[from.r][from.c];
  if (!piece) return next;
  next[to.r][to.c] = piece;
  next[from.r][from.c] = null;
  if (piece.type === "p" && (to.r === 0 || to.r === 7)) piece.type = "q";
  return next;
}

export function legalMovesForPiece(board: Board, r: number, c: number): Square[] {
  const piece = board[r][c];
  if (!piece) return [];
  return pseudoMoves(board, r, c).filter((m) => {
    const next = applyMove(board, { r, c }, m);
    return !isInCheck(next, piece.color);
  });
}

export function allLegalMoves(board: Board, turn: PieceColor): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === turn) {
        for (const m of legalMovesForPiece(board, r, c)) out.push({ from: { r, c }, to: m });
      }
    }
  }
  return out;
}

export function gameStatus(board: Board, turn: PieceColor): GameStatus {
  const moves = allLegalMoves(board, turn);
  if (moves.length === 0) return isInCheck(board, turn) ? "checkmate" : "stalemate";
  return isInCheck(board, turn) ? "check" : "ongoing";
}

export function squareName(r: number, c: number): string {
  return "abcdefgh"[c] + String(8 - r);
}

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

// Greedy one-ply bot: prefers captures and mate, avoids hanging the moved
// piece, with a little noise so games differ. Good enough to demo a live
// opponent, not a serious engine.
export function pickBotMove(
  board: Board,
  color: PieceColor,
  random: () => number = Math.random
): Move | null {
  const moves = allLegalMoves(board, color);
  if (moves.length === 0) return null;
  const enemy = opponentOf(color);
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const target = board[m.to.r][m.to.c];
    const next = applyMove(board, m.from, m.to);
    let score = (target ? PIECE_VALUE[target.type] : 0) + random() * 0.5;
    const status = gameStatus(next, enemy);
    if (status === "checkmate") score += 1000;
    else if (status === "check") score += 0.4;
    const mover = board[m.from.r][m.from.c];
    if (mover && isSquareAttacked(next, m.to.r, m.to.c, enemy)) {
      score -= PIECE_VALUE[mover.type] * 0.8;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
