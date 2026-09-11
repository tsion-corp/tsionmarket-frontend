import { describe, it, expect } from "vitest";
import { CASINO_GAMES, filterGames, type TileSize } from "@/features/casino/lib/games";

// Columns each tile size spans on the hub's six-column grid, at desktop width.
const SPAN: Record<TileSize, number> = { hero: 4, tall: 2, medium: 2, wide: 3 };

describe("casino game catalogue", () => {
  // The order the team set on 2026-09-11: Last Man, Chess, ArkBall, Checkers.
  // Last Man takes the hero slot and Chess the two-column slot beside it, so
  // the first row still fills the six columns; ArkBall and Checkers follow.
  it("leads with Last Man, then Chess, ArkBall and Checkers", () => {
    expect(CASINO_GAMES.slice(0, 4).map((g) => g.id)).toEqual([
      "last-standing",
      "chess",
      "arkball",
      "checkers",
    ]);
    const [first, second] = CASINO_GAMES;
    expect(first.size).toBe("hero");
    expect(SPAN[first.size] + SPAN[second.size]).toBe(6);
  });

  it("keeps that order under the All games filter", () => {
    const shown = filterGames(CASINO_GAMES, "All games", "");
    expect(shown.slice(0, 4).map((g) => g.id)).toEqual([
      "last-standing",
      "chess",
      "arkball",
      "checkers",
    ]);
  });

  it("keeps Draw as a coming-soon draw game", () => {
    const draw = CASINO_GAMES.find((game) => game.id === "draw");
    expect(draw).toMatchObject({ category: "Draws", href: null, comingSoon: true });
  });

  it("only links games that are actually playable", () => {
    for (const game of CASINO_GAMES) {
      if (game.comingSoon) expect(game.href).toBeNull();
      else expect(game.href).toMatch(/^\/casino\//);
    }
  });

  it("filters by category and by name search", () => {
    expect(filterGames(CASINO_GAMES, "Draws", "").map((g) => g.id)).toEqual(["arkball", "draw"]);
    expect(filterGames(CASINO_GAMES, "All games", "last").map((g) => g.id)).toEqual([
      "last-standing",
    ]);
    expect(filterGames(CASINO_GAMES, "All games", "zzz")).toEqual([]);
  });

  it("groups every unreleased game under Coming soon", () => {
    const soon = filterGames(CASINO_GAMES, "Coming soon", "");
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((g) => g.comingSoon)).toBe(true);
  });
});
