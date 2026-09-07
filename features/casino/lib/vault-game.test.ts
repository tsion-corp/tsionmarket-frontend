import { describe, expect, it } from "vitest";
import { isVaultGame, onlyVaultGames } from "@/features/casino/lib/vault-game";

const api = {
  gameId: 361,
  starter: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
  king: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
  pot: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.4998, formattedUsd: "$0.50" },
  minWager: { amount: "0.0002", tokenSymbol: "ETH", usdValue: 0.4998, formattedUsd: "$0.50" },
  endTime: 1788771879,
  timeRemaining: 0,
  settled: true,
  active: false,
};

// The vault's own domain Game carries potWei and minWagerWei; the API view
// the lobby renders carries pot and minWager with USD figures. The socket
// feed publishes the domain shape, so a row can arrive without `pot`, and a
// card then died on `pot.usdValue`. Rows are checked before they are kept.
describe("isVaultGame", () => {
  it("accepts the API view", () => {
    expect(isVaultGame(api)).toBe(true);
  });

  it("rejects the vault's domain shape and anything else", () => {
    const domain = { gameId: 361, potWei: "200642859722551", minWagerWei: "1", endTime: 1 };
    expect(isVaultGame(domain)).toBe(false);
    expect(isVaultGame({ ...api, pot: { amount: "1" } })).toBe(false);
    expect(isVaultGame({ ...api, gameId: "361" })).toBe(false);
    expect(isVaultGame(null)).toBe(false);
    expect(isVaultGame("x")).toBe(false);
  });
});

describe("onlyVaultGames", () => {
  it("keeps the well-formed rows and drops the rest", () => {
    const rows = onlyVaultGames([api, { gameId: 2, potWei: "1" }, null]);
    expect(rows.map((r) => r.gameId)).toEqual([361]);
  });

  it("is empty for a non-array", () => {
    expect(onlyVaultGames({})).toEqual([]);
    expect(onlyVaultGames(undefined)).toEqual([]);
  });
});
