import { describe, expect, it } from "vitest";
import { applyMove, legalMovesForSquare } from "@/features/casino/lib/chess/engine";
import { CHESS_LEARN_LESSONS, createChessLessonBoard } from "@/features/casino/lib/chess/learn";

describe("chess learn lessons", () => {
  it("keeps every prescribed lesson move legal from the position before it", () => {
    for (const lesson of CHESS_LEARN_LESSONS) {
      let board = createChessLessonBoard(lesson);
      let current = lesson.start;

      for (const target of lesson.targets) {
        const legal = legalMovesForSquare(board, current.r, current.c).some(
          (move) => move.to.r === target.r && move.to.c === target.c
        );
        expect(legal, `${lesson.id}: ${current.r},${current.c} -> ${target.r},${target.c}`).toBe(
          true
        );
        board = applyMove(board, current, target);
        current = target;
      }
    }
  });
});
