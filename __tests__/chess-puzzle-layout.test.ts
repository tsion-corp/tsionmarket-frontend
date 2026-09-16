import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puzzleMainWrapStyle } from "@/features/casino/components/chess-app/puzzle/puzzle-section";

describe("puzzleMainWrapStyle", () => {
  it("does not reserve a second header above the Lichess puzzle grid", () => {
    expect(puzzleMainWrapStyle).toEqual({ marginTop: "var(---sticky-gap)" });
  });

  it("does not pull the complete casino barrel into the puzzle route", () => {
    const source = readFileSync("app/(session)/casino/chess/puzzles/page.tsx", "utf8");

    expect(source).not.toContain('from "@/features/casino"');
  });
});
