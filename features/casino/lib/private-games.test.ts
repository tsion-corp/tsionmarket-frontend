import { describe, expect, it } from "vitest";
import { onlyVaultGames, publicGames } from "./vault-game";
import type { VaultGame } from "./vault-api";

const row = (over: Record<string, unknown> = {}) => ({
  gameId: 1,
  starter: "0x1",
  king: "0x2",
  pot: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  minWager: { amount: "1", tokenSymbol: "USDC", usdValue: 1, formattedUsd: "$1" },
  endTime: 1,
  timeRemaining: 1,
  settled: false,
  active: true,
  ...over,
});

describe("isPrivate, as the service sends it", () => {
  it("reads the flag off the row", () => {
    const [game] = onlyVaultGames([row({ isPrivate: true })]);
    expect(game.isPrivate).toBe(true);
  });

  // Every game started before the privacy upgrade reads false, which is what
  // those games always were. A missing flag must never read as private, or a
  // public game would vanish from the lobby.
  it("treats an absent flag as public", () => {
    const [game] = onlyVaultGames([row()]);
    expect(game.isPrivate).toBe(false);
  });

  it("treats a non-boolean flag as public rather than trusting it", () => {
    const [game] = onlyVaultGames([row({ isPrivate: "yes" })]);
    expect(game.isPrivate).toBe(false);
  });
});

describe("publicGames", () => {
  it("keeps only the games anyone may find", () => {
    const rows = onlyVaultGames([
      row({ gameId: 1, isPrivate: false }),
      row({ gameId: 2, isPrivate: true }),
      row({ gameId: 3 }),
    ]);
    expect(publicGames(rows).map((g) => g.gameId)).toEqual([1, 3]);
  });

  // A private game the starter opened seconds ago may reach the client before
  // the reconciler has indexed its GamePrivacySet log, so the row says public
  // when it is not. The starter's own record of what they chose covers that
  // window; without it their private game flashes into everyone's lobby.
  it("hides a game the starter marked private before the service caught up", () => {
    const rows = onlyVaultGames([row({ gameId: 7, isPrivate: false })]);
    expect(publicGames(rows, [7])).toEqual([]);
  });

  it("does not hide a game on somebody else's local marks", () => {
    const rows = onlyVaultGames([row({ gameId: 7, isPrivate: false })]);
    expect(publicGames(rows, [99]).map((g) => g.gameId)).toEqual([7]);
  });

  it("is empty for an empty lobby", () => {
    expect(publicGames([] as VaultGame[])).toEqual([]);
  });
});
