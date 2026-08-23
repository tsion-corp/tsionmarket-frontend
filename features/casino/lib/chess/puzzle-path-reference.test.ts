import { describe, expect, it } from "vitest";
import {
  calculatePuzzlePathAward,
  getPuzzlePathPosition,
  getPuzzlePathTierNodes,
  PUZZLE_PATH_PRESTIGE_XP,
} from "./puzzle-path-reference";

describe("captured Puzzle Path model", () => {
  it("maps the captured 102 XP snapshot to Wood level 3", () => {
    expect(getPuzzlePathPosition(102)).toMatchObject({
      prestige: 1,
      tierName: "Wood",
      level: 3,
      levelXp: 7,
      levelRequiredXp: 110,
    });
  });

  it("moves from Wood to Stone after level 20", () => {
    expect(getPuzzlePathPosition(3960)).toMatchObject({ tierName: "Stone", level: 1 });
  });

  it("starts a new prestige after all eight tiers", () => {
    expect(getPuzzlePathPosition(PUZZLE_PATH_PRESTIGE_XP)).toMatchObject({
      prestige: 2,
      tierName: "Wood",
      level: 1,
    });
  });

  it("marks completed, current, and locked nodes", () => {
    expect(
      getPuzzlePathTierNodes(102)
        .map((node) => node.state)
        .slice(0, 4)
    ).toEqual(["complete", "complete", "current", "locked"]);
  });

  it("uses retry points after an incorrect attempt", () => {
    const reward = {
      difficulty: "Hard" as const,
      base: 40,
      speed: 10,
      streak: 2,
      daily: 0,
      retry: 8,
    };
    expect(calculatePuzzlePathAward(reward, 0).total).toBe(52);
    expect(calculatePuzzlePathAward(reward, 1).total).toBe(8);
  });
});
