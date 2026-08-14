import { describe, expect, it } from "vitest";
import { applyMove, legalMoves, moveToUci, parseFen, STARTING_FEN } from "./engine";
import { DRAUGHTS_HOME_PUZZLE_LINE } from "./home-puzzle";

describe("draughts home coach puzzle", () => {
  it("contains a legal player move and reply at every step", () => {
    let position = parseFen(STARTING_FEN, "standard");

    for (const turn of DRAUGHTS_HOME_PUZZLE_LINE) {
      const playerMove = legalMoves(position).find((move) => moveToUci(move) === turn.player);
      expect(playerMove, `player move ${turn.player}`).toBeDefined();
      position = applyMove(position, playerMove!);

      const reply = legalMoves(position).find((move) => moveToUci(move) === turn.reply);
      expect(reply, `reply ${turn.reply}`).toBeDefined();
      position = applyMove(position, reply!);
    }
  });
});
