import { describe, expect, it } from "vitest";
import { fitFontSize, wrapLines, type TextMetricsSource } from "./share-image";

// A measurer with one character width, which makes every expectation here a
// character count rather than a guess about a font.
const PER_CHAR = 10;
const ctx = (): TextMetricsSource => ({
  font: "",
  measureText: (text: string) => ({ width: text.length * PER_CHAR }),
});

describe("fitting a name to the card", () => {
  it("keeps the design's size when the name fits", () => {
    expect(fitFontSize(ctx(), "Game #153", 1000, 44, 34)).toBe(44);
  });

  // The measurer here does not scale with the font, so anything too wide walks
  // all the way down. What matters is that it stops at the floor rather than
  // shrinking to nothing.
  it("never shrinks past the floor", () => {
    expect(fitFontSize(ctx(), "a".repeat(400), 200, 44, 34)).toBe(34);
  });
});

describe("wrapping the starter's words", () => {
  it("leaves a short line alone", () => {
    expect(wrapLines(ctx(), "Winner takes the lot", 1000, 2)).toEqual(["Winner takes the lot"]);
  });

  it("breaks on words, not mid-word", () => {
    expect(wrapLines(ctx(), "Winner takes the whole lot tonight", 200, 2)).toEqual([
      "Winner takes the",
      "whole lot tonight",
    ]);
  });

  it("stops at the line budget and marks what it dropped", () => {
    const lines = wrapLines(ctx(), "one two three four five six seven eight", 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("adds no ellipsis when everything fitted", () => {
    expect(wrapLines(ctx(), "one two", 1000, 2).join("")).not.toContain("…");
  });

  it("has nothing to draw for an empty description", () => {
    expect(wrapLines(ctx(), "   ", 1000, 2)).toEqual([]);
  });

  // A single token longer than the line overflows rather than being cut in
  // half: one pathological word reads better wide than hyphenated.
  it("lets one over-long word run", () => {
    expect(wrapLines(ctx(), "supercalifragilistic", 50, 2)).toEqual(["supercalifragilistic"]);
  });
});
