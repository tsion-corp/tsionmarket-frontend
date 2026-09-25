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

  // Back on staging on 2026-09-11: the two crash games sit right after
  // Checkers, playable, with their branded art kept in colour.
  it("places Arkjet and Pilot Chicken after Checkers", () => {
    const checkers = CASINO_GAMES.findIndex((game) => game.id === "checkers");
    expect(CASINO_GAMES[checkers + 1]).toMatchObject({
      id: "arkjet",
      href: "/casino/arkjet",
      preserveImageColor: true,
      comingSoon: false,
    });
    expect(CASINO_GAMES[checkers + 2]).toMatchObject({
      id: "chicken",
      href: "/casino/chicken",
      preserveImageColor: true,
      comingSoon: false,
    });
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

  it("uses the two-column footprint for every game after the hero", () => {
    expect(CASINO_GAMES[0].size).toBe("hero");
    expect(CASINO_GAMES.slice(1).every((game) => game.size === "tall")).toBe(true);
  });

  it("has no Draw game", () => {
    expect(CASINO_GAMES.some((game) => game.id === "draw")).toBe(false);
  });

  it("only links games that are actually playable", () => {
    for (const game of CASINO_GAMES) {
      if (game.comingSoon) expect(game.href).toBeNull();
      else expect(game.href).toMatch(/^\/casino\//);
    }
  });

  it("filters by category and by name search", () => {
    expect(filterGames(CASINO_GAMES, "Draws", "").map((g) => g.id)).toEqual(["arkball"]);
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
