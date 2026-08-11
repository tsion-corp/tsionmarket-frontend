import { describe, expect, it } from "vitest";
import {
  applyMove,
  capturedCounts,
  completedMove,
  exportFen,
  fieldToRc,
  legalMoves,
  moveToSan,
  moveToUci,
  movableFields,
  nextTargets,
  parseFen,
  parseUci,
  rcToField,
  STARTING_FEN,
  type DraughtsMove,
} from "@/features/casino/lib/draughts/engine";

function movesFrom(fen: string): DraughtsMove[] {
  return legalMoves(parseFen(fen));
}

function sans(fen: string): string[] {
  return movesFrom(fen).map(moveToSan).sort();
}

describe("board geometry", () => {
  it("round-trips every playable field", () => {
    for (let field = 1; field <= 50; field++) {
      const { row, col } = fieldToRc(field);
      expect(rcToField(row, col)).toBe(field);
    }
  });

  it("places the numbering on the dark squares only", () => {
    for (let field = 1; field <= 50; field++) {
      const { row, col } = fieldToRc(field);
      expect((row + col) % 2).toBe(1);
    }
  });

  it("rejects light squares and anything off the board", () => {
    expect(rcToField(0, 0)).toBeNull();
    expect(rcToField(5, 5)).toBeNull();
    expect(rcToField(-1, 2)).toBeNull();
    expect(rcToField(10, 3)).toBeNull();
  });
});

describe("fen", () => {
  it("reads the starting position as twenty pieces a side", () => {
    const { board, turn } = parseFen(STARTING_FEN);
    expect(turn).toBe("white");
    expect(board.filter((p) => p?.side === "white")).toHaveLength(20);
    expect(board.filter((p) => p?.side === "black")).toHaveLength(20);
    expect(board[31]).toEqual({ side: "white", kind: "man" });
    expect(board[20]).toEqual({ side: "black", kind: "man" });
    expect(board[21]).toBeNull();
  });

  it("exports kings before men, in the service's own comma form", () => {
    // The service joins the side letter into the list, so a position reads back
    // as "W,K50,31" rather than "WK50,31". Both parse; only this one is emitted.
    expect(exportFen(parseFen("B:WK50,31:BK1,20"))).toBe("B:W,K50,31:B,K1,20");
  });

  it("is stable once exported", () => {
    const canonical = exportFen(parseFen("B:WK50,31:BK1,20"));
    expect(exportFen(parseFen(canonical))).toBe(canonical);
  });

  it("expands a range and reads a king prefix", () => {
    const { board } = parseFen("W:WK46-48:B1");
    expect(board[46]).toEqual({ side: "white", kind: "king" });
    expect(board[48]).toEqual({ side: "white", kind: "king" });
  });

  it("rejects a fen with no side to move", () => {
    expect(() => parseFen("X:W31:B1")).toThrow();
  });
});

describe("quiet moves", () => {
  it("gives white nine opening moves from the starting position", () => {
    // Only the rank behind the gap can advance, and 46-50 are boxed in.
    expect(movesFrom(STARTING_FEN)).toHaveLength(9);
    expect(sans(STARTING_FEN)).toContain("31-26");
  });

  it("moves men forward only", () => {
    // A lone white man on 27 may step to 21 and 22, never back down the board.
    expect(sans("W:W27:B")).toEqual(["27-21", "27-22"]);
  });

  it("slides a king any distance until something blocks", () => {
    const moves = sans("W:WK46:B");
    expect(moves).toContain("46-41");
    expect(moves).toContain("46-19");
    expect(moves).not.toContain("46-46");
  });
});

describe("captures", () => {
  it("forces a capture over an otherwise legal quiet move", () => {
    // Matches the backend's own case: with 22 takeable, 27-21 stops being legal.
    const moves = sans("W:W27:B22");
    expect(moves).toEqual(["27x18"]);
    expect(moves).not.toContain("27-21");
  });

  it("lets a man capture backwards", () => {
    // Men only step forward, but they jump in all four directions.
    const moves = sans("W:W27:B32");
    expect(moves).toEqual(["27x38"]);
  });

  it("keeps only the longest sequence when several are available", () => {
    const moves = movesFrom("W:W47:B41,42,32");
    expect(moves).toHaveLength(1);
    expect(moves[0].captured).toHaveLength(2);
    // Taking 41 first ends after one piece, so the two-piece line is the only
    // legal move even though both start from the same square.
    expect(moveToSan(moves[0])).toBe("47x38x27");
  });

  it("chains a man through a multi-jump", () => {
    const moves = movesFrom("W:W48:B43,33");
    expect(moves).toHaveLength(1);
    expect(moves[0].path).toEqual([48, 39, 28]);
    expect(moves[0].captured).toEqual([43, 33]);
  });

  it("lands a king anywhere beyond the piece it takes", () => {
    const moves = movesFrom("W:WK50:B44");
    expect(moves.length).toBeGreaterThan(1);
    expect(moves.every((move) => move.captured.length === 1)).toBe(true);
    expect(moves.every((move) => move.captured[0] === 44)).toBe(true);
    expect(moves.map((move) => move.path[1])).toContain(39);
    expect(moves.map((move) => move.path[1])).toContain(6);
  });

  it("does not jump a piece with another piece directly behind it", () => {
    expect(movesFrom("W:W27:B22,18").every((move) => move.captured.length === 0)).toBe(true);
  });

  it("never jumps its own piece", () => {
    expect(movesFrom("W:W27,22:B").every((move) => move.captured.length === 0)).toBe(true);
  });
});

describe("applying a move", () => {
  it("hands the turn to the other side", () => {
    const position = parseFen(STARTING_FEN);
    const move = legalMoves(position).find((m) => moveToSan(m) === "31-26");
    expect(move).toBeDefined();
    const after = applyMove(position, move as DraughtsMove);
    expect(after.turn).toBe("black");
    expect(after.board[26]).toEqual({ side: "white", kind: "man" });
    expect(after.board[31]).toBeNull();
  });

  it("clears every captured square", () => {
    const position = parseFen("W:W48:B43,33");
    const after = applyMove(position, legalMoves(position)[0]);
    expect(after.board[43]).toBeNull();
    expect(after.board[33]).toBeNull();
    expect(after.board[28]).toEqual({ side: "white", kind: "man" });
  });

  it("crowns a white man that reaches the top row", () => {
    const position = parseFen("W:W7:B");
    const move = legalMoves(position).find((m) => m.path[1] === 1);
    const after = applyMove(position, move as DraughtsMove);
    expect(after.board[1]).toEqual({ side: "white", kind: "king" });
  });

  it("crowns a black man that reaches the bottom row", () => {
    const position = parseFen("B:W:B44");
    const move = legalMoves(position).find((m) => m.path[1] === 50);
    const after = applyMove(position, move as DraughtsMove);
    expect(after.board[50]).toEqual({ side: "black", kind: "king" });
  });

  it("leaves a king a king", () => {
    const position = parseFen("W:WK7:B");
    const move = legalMoves(position).find((m) => m.path[1] === 1);
    const after = applyMove(position, move as DraughtsMove);
    expect(after.board[1]).toEqual({ side: "white", kind: "king" });
  });
});

describe("notation", () => {
  it("writes a quiet move with a dash and a capture with an x", () => {
    expect(moveToSan({ path: [31, 26], captured: [] })).toBe("31-26");
    expect(moveToSan({ path: [27, 18], captured: [22] })).toBe("27x18");
    expect(moveToSan({ path: [48, 39, 28], captured: [43, 33] })).toBe("48x39x28");
  });

  it("pads every square to two digits on the wire", () => {
    expect(moveToUci({ path: [7, 1], captured: [] })).toBe("0701");
    expect(moveToUci({ path: [31, 26], captured: [] })).toBe("3126");
    expect(moveToUci({ path: [48, 39, 28], captured: [43, 33] })).toBe("483928");
  });

  it("parses a uci path back to its squares", () => {
    expect(parseUci("3126")).toEqual([31, 26]);
    expect(parseUci("483928")).toEqual([48, 39, 28]);
    expect(parseUci("31-26")).toEqual([31, 26]);
  });

  it("refuses a malformed or out-of-range uci", () => {
    expect(parseUci("31")).toBeNull();
    expect(parseUci("312")).toBeNull();
    expect(parseUci("3199")).toBeNull();
    expect(parseUci("0031")).toBeNull();
  });
});

describe("board interaction", () => {
  it("offers the squares that may follow the path so far", () => {
    const moves = movesFrom("W:W48:B43,33");
    expect(nextTargets(moves, [48])).toEqual([39]);
    expect(nextTargets(moves, [48, 39])).toEqual([28]);
    expect(nextTargets(moves, [48, 39, 28])).toEqual([]);
  });

  it("reports a move only once its path is complete", () => {
    const moves = movesFrom("W:W48:B43,33");
    expect(completedMove(moves, [48, 39])).toBeNull();
    expect(completedMove(moves, [48, 39, 28])?.captured).toEqual([43, 33]);
  });

  it("lists only the pieces with a legal move", () => {
    // The forced capture leaves the man on 27 as the only movable piece.
    expect(movableFields(movesFrom("W:W27,50:B22"))).toEqual([27]);
  });
});

describe("captured counts", () => {
  it("counts nothing taken at the start", () => {
    expect(capturedCounts(parseFen(STARTING_FEN).board)).toEqual({ white: 0, black: 0 });
  });

  it("counts what each side has lost", () => {
    expect(capturedCounts(parseFen("W:W31,32:B1").board)).toEqual({ white: 18, black: 19 });
  });
});
