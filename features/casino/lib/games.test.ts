import { describe, it, expect } from "vitest";
import { CASINO_GAMES, filterGames, type TileSize } from "@/features/casino/lib/games";

// Columns each tile size spans on the hub's six-column grid, at desktop width.
const SPAN: Record<TileSize, number> = { hero: 4, tall: 2, medium: 2, wide: 3 };

describe("casino game catalogue", () => {
  // The order the team set on 2026-09-11 was Last Man, Chess, ArkBall,
  // Checkers, with Last Man in the hero slot. Last Man is hidden on production
  // (see the describe block at the foot of this file), so Chess now leads and
  // the three two-column tiles fill the first row exactly.
  it("leads with Chess, then ArkBall and Checkers", () => {
    expect(CASINO_GAMES.slice(0, 3).map((g) => g.id)).toEqual(["chess", "arkball", "checkers"]);
    const [first, second, third] = CASINO_GAMES;
    expect(SPAN[first.size] + SPAN[second.size] + SPAN[third.size]).toBe(6);
  });

  it("keeps that order under the All games filter", () => {
    const shown = filterGames(CASINO_GAMES, "All games", "");
    expect(shown.slice(0, 3).map((g) => g.id)).toEqual(["chess", "arkball", "checkers"]);
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
    // "last" matched The Last Man, which is hidden; nothing else is named for
    // it, so the search now finds nothing rather than a dead tile.
    expect(filterGames(CASINO_GAMES, "All games", "last")).toEqual([]);
    expect(filterGames(CASINO_GAMES, "All games", "zzz")).toEqual([]);
  });

  it("groups every unreleased game under Coming soon", () => {
    const soon = filterGames(CASINO_GAMES, "Coming soon", "");
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((g) => g.comingSoon)).toBe(true);
  });
});

// Hidden on production while the vault service settles games against the wrong
// contract: every Last Man game played lands on v4, and the keeper, now pointed
// at v5, calls settle() there and reverts GameNotFound, so the pot is stranded
// until someone settles it by hand. Restoring the game is uncommenting one
// entry in CASINO_GAMES and the two route redirects. See
// vault-v5-cutover-report.md.
describe("The Last Man, hidden on production", () => {
  it("is not in the catalogue, so no tile and no hub entry", () => {
    expect(CASINO_GAMES.some((game) => game.id === "last-standing")).toBe(false);
  });

  // The hero was four of the six columns. With it gone the first row has to be
  // whole again rather than leaving a hole beside a lone tall tile.
  it("leaves a catalogue whose visible games still fill the grid", () => {
    const playable = CASINO_GAMES.filter((game) => !game.comingSoon);
    expect(playable.length).toBeGreaterThan(0);
    expect(playable.some((game) => game.size === "hero")).toBe(false);
  });
});
