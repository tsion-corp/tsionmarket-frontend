import { describe, it, expect } from "vitest";
import {
  initialBoard,
  applyMove,
  legalMovesForPiece,
  allLegalMoves,
  gameStatus,
  isInCheck,
  squareName,
  pickBotMove,
  type Board,
  type Square,
} from "@/lib/casino/chess/engine";

// Applies moves given in {from, to} algebraic-ish coordinates for readability.
function play(board: Board, moves: Array<[Square, Square]>): Board {
  return moves.reduce((b, [from, to]) => applyMove(b, from, to), board);
}

describe("casino chess engine", () => {
  it("sets up the standard start position", () => {
    const b = initialBoard();
    expect(b[7][4]).toEqual({ type: "k", color: "w" });
    expect(b[0][3]).toEqual({ type: "q", color: "b" });
    expect(b[6].every((p) => p?.type === "p" && p.color === "w")).toBe(true);
    expect(b[4].every((p) => p === null)).toBe(true);
  });

  it("gives each side 20 legal opening moves", () => {
    const b = initialBoard();
    expect(allLegalMoves(b, "w")).toHaveLength(20);
    expect(allLegalMoves(b, "b")).toHaveLength(20);
  });

  it("lets a pawn advance one or two from its start row only", () => {
    const b = initialBoard();
    expect(legalMovesForPiece(b, 6, 4)).toEqual([
      { r: 5, c: 4 },
      { r: 4, c: 4 },
    ]);
    const after = applyMove(b, { r: 6, c: 4 }, { r: 5, c: 4 });
    expect(legalMovesForPiece(after, 5, 4)).toEqual([{ r: 4, c: 4 }]);
  });

  it("does not allow a move that leaves the king in check", () => {
    // White pawn e2 is pinned to the king by a black rook that slides to e-file.
    const b = initialBoard();
    // Clear the e-file between the black rook (moved to e5) and white's e2 pawn.
    const staged = play(b, [
      [
        { r: 0, c: 0 },
        { r: 4, c: 4 },
      ], // black rook to e4-ish square (r4,c4)
    ]);
    // Remove white's e2 pawn cover: rook now eyes e2. Any e2 pawn capture
    // sideways would expose the king, and there is none, so only forward
    // moves that block remain legal. The key assertion: no legal move for
    // e2 pawn may leave the king attacked.
    for (const m of legalMovesForPiece(staged, 6, 4)) {
      const next = applyMove(staged, { r: 6, c: 4 }, m);
      expect(isInCheck(next, "w")).toBe(false);
    }
  });

  it("detects fool's mate as checkmate", () => {
    const b = play(initialBoard(), [
      [
        { r: 6, c: 5 },
        { r: 5, c: 5 },
      ], // 1. f3
      [
        { r: 1, c: 4 },
        { r: 3, c: 4 },
      ], // 1... e5
      [
        { r: 6, c: 6 },
        { r: 4, c: 6 },
      ], // 2. g4
      [
        { r: 0, c: 3 },
        { r: 4, c: 7 },
      ], // 2... Qh4#
    ]);
    expect(gameStatus(b, "w")).toBe("checkmate");
  });

  it("reports check for the attacked side and ongoing otherwise", () => {
    // 1. f3 e5 2... Qh4+ is check but not mate: white can block with g3.
    const b = play(initialBoard(), [
      [
        { r: 6, c: 5 },
        { r: 5, c: 5 },
      ], // 1. f3
      [
        { r: 1, c: 4 },
        { r: 3, c: 4 },
      ], // 1... e5
      [
        { r: 0, c: 3 },
        { r: 4, c: 7 },
      ], // 2... Qh4+
    ]);
    expect(isInCheck(b, "w")).toBe(true);
    expect(gameStatus(b, "w")).toBe("check");
  });

  it("auto-promotes a pawn reaching the last rank to a queen", () => {
    const empty: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    empty[1][0] = { type: "p", color: "w" };
    empty[7][4] = { type: "k", color: "w" };
    empty[0][7] = { type: "k", color: "b" };
    const after = applyMove(empty, { r: 1, c: 0 }, { r: 0, c: 0 });
    expect(after[0][0]).toEqual({ type: "q", color: "w" });
  });

  it("names squares in algebraic notation", () => {
    expect(squareName(7, 0)).toBe("a1");
    expect(squareName(0, 7)).toBe("h8");
    expect(squareName(4, 4)).toBe("e4");
  });

  it("bot always returns a legal move while the game is ongoing", () => {
    const b = initialBoard();
    const move = pickBotMove(b, "b", () => 0.5);
    expect(move).not.toBeNull();
    const legal = allLegalMoves(b, "b");
    expect(
      legal.some(
        (m) =>
          m.from.r === move?.from.r &&
          m.from.c === move.from.c &&
          m.to.r === move.to.r &&
          m.to.c === move.to.c
      )
    ).toBe(true);
  });

  it("bot prefers delivering checkmate", () => {
    // Back-rank mate in one: black rook a8 to a1 style setup.
    const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    board[7][7] = { type: "k", color: "w" };
    board[6][6] = { type: "p", color: "w" };
    board[6][7] = { type: "p", color: "w" };
    board[0][0] = { type: "r", color: "b" };
    board[0][4] = { type: "k", color: "b" };
    const move = pickBotMove(board, "b", () => 0);
    expect(move).toEqual({ from: { r: 0, c: 0 }, to: { r: 7, c: 0 } });
    const after = applyMove(board, move!.from, move!.to);
    expect(gameStatus(after, "w")).toBe("checkmate");
  });
});
