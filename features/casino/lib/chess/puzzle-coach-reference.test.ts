import { describe, expect, it } from "vitest";
import { applyUciToFen, legalMovesForSquare, toUci } from "./engine";
import { PUZZLE_COACH_REFERENCES } from "./puzzle-coach-reference";

describe("puzzle coach reference fixtures", () => {
  it.each(PUZZLE_COACH_REFERENCES)("keeps solution $solutionUci legal for puzzle $id", (puzzle) => {
    const moves = legalMovesForSquare(puzzle.fen, puzzle.hintFrom.r, puzzle.hintFrom.c);
    const solution = moves.find(
      (move) => toUci(puzzle.fen, move.from, move.to) === puzzle.solutionUci
    );

    expect(solution).toBeDefined();
    expect(applyUciToFen(puzzle.fen, puzzle.solutionUci)).not.toBeNull();
  });
});
