import { describe, it, expect } from "vitest";
import {
  applyUciToFen,
  parseFen,
  toUci,
  initialBoard,
  applyMove,
  legalMovesForPiece,
  legalMovesForSquare,
  allLegalMoves,
  gameStatus,
  isInCheck,
  squareName,
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
});

describe("server interop", () => {
  it("parses the opening position from FEN", () => {
    const { board, turn } = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(turn).toBe("w");
    expect(board[0][0]).toEqual({ type: "r", color: "b" });
    expect(board[7][4]).toEqual({ type: "k", color: "w" });
    expect(board[4].every((sq) => sq === null)).toBe(true);
  });

  it("parses a mid-game position with the side to move", () => {
    const { board, turn } = parseFen(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"
    );
    expect(turn).toBe("b");
    // Both e-pawns have advanced two squares.
    expect(board[4][4]).toEqual({ type: "p", color: "w" });
    expect(board[3][4]).toEqual({ type: "p", color: "b" });
    expect(board[6][4]).toBeNull();
  });

  it("rejects a malformed FEN rather than rendering a partial board", () => {
    expect(() => parseFen("not-a-fen")).toThrow(/Malformed FEN/);
    expect(() => parseFen("rnbqkbnr/pppppppp/8/8 w")).toThrow(/Malformed FEN/);
    expect(() => parseFen("xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w")).toThrow(
      /Malformed FEN/
    );
  });

  it("encodes moves as the server expects, promoting to a queen", () => {
    const board = initialBoard();
    expect(toUci(board, { r: 6, c: 4 }, { r: 4, c: 4 })).toBe("e2e4");

    const promo: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    promo[1][0] = { type: "p", color: "w" };
    expect(toUci(promo, { r: 1, c: 0 }, { r: 0, c: 0 })).toBe("a7a8q");
  });

  it("round-trips a position through FEN into legal move generation", () => {
    const { board } = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(allLegalMoves(board, "w")).toHaveLength(20);
  });

  it("preserves castling rights when legal moves come from FEN", () => {
    const position = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(legalMovesForSquare(position, 7, 4)).toEqual(
      expect.arrayContaining([
        { from: { r: 7, c: 4 }, to: { r: 7, c: 6 } },
        { from: { r: 7, c: 4 }, to: { r: 7, c: 2 } },
      ])
    );
  });

  it("preserves en passant from FEN in legal moves and optimistic application", () => {
    const position = parseFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    expect(legalMovesForSquare(position, 3, 4)).toEqual(
      expect.arrayContaining([{ from: { r: 3, c: 4 }, to: { r: 2, c: 3 } }])
    );

    const next = applyUciToFen(position.fen, "e5d6");
    expect(next?.board[2][3]).toEqual({ type: "p", color: "w" });
    expect(next?.board[3][3]).toBeNull();
  });

  it("offers all promotion choices and applies underpromotion exactly", () => {
    const position = parseFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const promotions = legalMovesForSquare(position, 1, 0)
      .map((move) => move.promotion)
      .filter(Boolean)
      .sort();

    expect(promotions).toEqual(["b", "n", "q", "r"]);
    expect(toUci(position, { r: 1, c: 0 }, { r: 0, c: 0 }, "n")).toBe("a7a8n");
    expect(applyUciToFen(position.fen, "a7a8n")?.board[0][0]).toEqual({
      type: "n",
      color: "w",
    });
  });
});
