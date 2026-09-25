import { describe, expect, it } from "vitest";
import { gameTitle, onlyVaultGames } from "./vault-game";

const base = {
  gameId: 244,
  starter: "0x1",
  king: "0x2",
  pot: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  minWager: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  endTime: 1,
  timeRemaining: 0,
  settled: false,
  active: true,
};

describe("a game's name, as the service sends it", () => {
  it("reads the title and description off the metadata object", () => {
    const [game] = onlyVaultGames([
      { ...base, metadata: { title: "Friday big one", description: "no mercy" } },
    ]);
    expect(game.title).toBe("Friday big one");
    expect(game.description).toBe("no mercy");
  });

  // Every game started before this shipped has no metadata at all, so the
  // absent case is the common one for a while and must not drop the row.
  it("keeps a game that has no metadata", () => {
    const [game] = onlyVaultGames([base]);
    expect(game.gameId).toBe(244);
    expect(game.title).toBeUndefined();
  });

  it("keeps a game whose metadata is malformed, without a title", () => {
    const rows = onlyVaultGames([
      { ...base, metadata: null },
      { ...base, gameId: 245, metadata: { title: 42 } },
      { ...base, gameId: 246, metadata: "nope" },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.title === undefined)).toBe(true);
  });

  // The service caps these, but it is the sender of record and a client that
  // trusts a length is a client that a changed service can break.
  it("ignores a blank title rather than rendering an empty heading", () => {
    const [game] = onlyVaultGames([{ ...base, metadata: { title: "   " } }]);
    expect(game.title).toBeUndefined();
  });

  it("drops a description with no title, because the title is the label", () => {
    const [game] = onlyVaultGames([{ ...base, metadata: { description: "orphan" } }]);
    expect(game.title).toBeUndefined();
    expect(game.description).toBeUndefined();
  });
});

describe("gameTitle", () => {
  it("prefers the name and falls back to the number", () => {
    expect(gameTitle({ gameId: 244, title: "Friday" }, (id) => `Game ${id}`)).toBe("Friday");
    expect(gameTitle({ gameId: 244 }, (id) => `Game ${id}`)).toBe("Game 244");
  });
});
