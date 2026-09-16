import { describe, expect, it } from "vitest";
import {
  getCapturedMaterial,
  getMaterialDiff,
  getScore,
} from "../../components/chess/lib/src/game/material";

describe("captured material", () => {
  it("keeps captures for both players when trades cancel the material difference", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

    expect(getCapturedMaterial(fen)).toEqual({
      white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 1 },
      black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 1 },
    });
    expect(getScore(getMaterialDiff(fen))).toBe(0);
  });

  it("assigns missing pieces to the player who captured them", () => {
    const fen = "rnb1kbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

    const captured = getCapturedMaterial(fen);
    expect(captured.white.queen).toBe(1);
    expect(captured.white.pawn).toBe(1);
    expect(captured.black.pawn).toBe(1);
  });
});
