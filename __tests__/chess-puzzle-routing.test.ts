import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePuzzleColor,
  parsePuzzleDifficulty,
  puzzleTargetRating,
} from "@/features/casino/components/chess-app/puzzle/puzzle-preferences";

describe("chess puzzle routing", () => {
  it("has a dedicated page that a hard refresh can resolve directly", () => {
    expect(existsSync("app/(session)/casino/chess/puzzles/page.tsx")).toBe(true);
    const page = readFileSync("app/(session)/casino/chess/puzzles/page.tsx", "utf8");

    expect(page).toContain("<PuzzleSection />");
    expect(page).not.toContain("redirect(");
  });

  it("keeps copied puzzle navigation inside the Ark chess route", () => {
    const source = readFileSync("features/casino/components/chess/puzzle/src/routes.ts", "utf8");

    expect(source).toContain("const PUZZLE_APP_PATH = '/casino/chess/puzzles'");
    expect(source).toContain("params.set('difficulty', options.difficulty)");
    expect(source).toContain("params.set('color', options.color)");
  });

  it("maps Lichess difficulty levels onto the requested backend rating", () => {
    expect(puzzleTargetRating(1500, "easiest")).toBe(900);
    expect(puzzleTargetRating(1500, "normal")).toBe(1500);
    expect(puzzleTargetRating(1500, "hardest")).toBe(2100);
    expect(puzzleTargetRating(700, "easiest")).toBe(400);
  });

  it("rejects invalid URL preference values", () => {
    expect(parsePuzzleDifficulty("impossible")).toBe("normal");
    expect(parsePuzzleColor("green")).toBe("random");
  });

  it("mounts the copied puzzle UI inside Lila's required is2d boundary", () => {
    const source = readFileSync(
      "features/casino/components/chess-app/puzzle/puzzle-section.tsx",
      "utf8"
    );

    expect(source).toContain('id="main-wrap"');
    expect(source).toContain('className="is2d"');
  });
});
