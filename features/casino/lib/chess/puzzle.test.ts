import { describe, expect, it } from "vitest";
import type { ChessPuzzle } from "@/features/casino/lib/api/types";
import {
  primaryPuzzleTheme,
  puzzleThemeArtwork,
  puzzleThemeLabel,
} from "@/features/casino/lib/chess/puzzle";

function puzzle(themes: string[]): ChessPuzzle {
  const line = { text: "", speech: null };
  return {
    id: "abc",
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    lastMove: "h2h1",
    sideToMove: "white",
    rating: 1200,
    ratingDeviation: 80,
    popularity: 90,
    playCount: 10,
    themes,
    openingTags: [],
    sourceUrl: "https://lichess.org/example",
    playerMoveCount: 1,
    narration: { introduction: line, hint: line, success: line },
  };
}

describe("puzzle presentation helpers", () => {
  it("uses the first meaningful theme and its copied Lila artwork", () => {
    const item = puzzle(["short", "discoveredAttack"]);
    expect(primaryPuzzleTheme(item)).toBe("discoveredAttack");
    expect(puzzleThemeArtwork(item)).toBe("/chess/puzzle-themes/discoveredAttack.svg");
    expect(puzzleThemeLabel("discoveredAttack")).toBe("Discovered attack");
  });

  it("shares the generic mate artwork across mate depths", () => {
    expect(puzzleThemeArtwork(puzzle(["mateIn3"]))).toBe("/chess/puzzle-themes/mate.svg");
  });
});
