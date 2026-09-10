import { describe, it, expect } from "vitest";
import { CASINO_GAMES, filterGames, type TileSize } from "@/features/casino/lib/games";

// Columns each tile size spans on the hub's six-column grid, at desktop width.
const SPAN: Record<TileSize, number> = { hero: 4, tall: 2, medium: 2, wide: 3 };

describe("casino game catalogue", () => {
  it("puts Last Man Standing beside Chess in the first row", () => {
    const [first, second] = CASINO_GAMES;
    expect(first.id).toBe("chess");
    expect(second.id).toBe("last-standing");
    // The two together fill the six-column row exactly, so nothing else can
    // slot in between them.
    expect(SPAN[first.size] + SPAN[second.size]).toBe(6);
  });

  it("keeps that pairing under the All games filter", () => {
    const shown = filterGames(CASINO_GAMES, "All games", "");
    expect(shown.slice(0, 2).map((g) => g.id)).toEqual(["chess", "last-standing"]);
  });

  it("keeps Draw intact and adds ArkBall immediately after Checkers", () => {
    const draw = CASINO_GAMES.find((game) => game.id === "draw");
    expect(draw).toMatchObject({
      name: "Draw",
      href: null,
      comingSoon: true,
      note: "Pick 5 numbers and a bonus",
    });

    const checkersIndex = CASINO_GAMES.findIndex((game) => game.id === "checkers");
    expect(CASINO_GAMES[checkersIndex + 1]).toMatchObject({
      id: "arkball",
      href: "/casino/arkball",
      comingSoon: false,
    });
  });

  it("only links games that are actually playable", () => {
    for (const game of CASINO_GAMES) {
      if (game.comingSoon) expect(game.href).toBeNull();
      else expect(game.href).toMatch(/^\/casino\//);
    }
  });

  it("filters by category and by name search", () => {
    expect(filterGames(CASINO_GAMES, "Draws", "").map((g) => g.id)).toEqual(["draw", "arkball"]);
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
