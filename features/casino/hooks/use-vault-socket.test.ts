// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { handleVaultFrame } from "@/features/casino/hooks/use-vault-socket";

// The production hub sends `{"type":"activeGames","data":{"games":{}}}`: an
// object where the contract says an array. Written into the cache as-is, the
// lobby's `games.map` threw and the whole page went to the error boundary.
// A frame is an upstream payload; it is validated at the boundary like any
// other, and a malformed one never reaches a component.
describe("activeGames frames", () => {
  const row = (gameId: number) => ({
    gameId,
    starter: "0xa",
    king: "0xa",
    pot: { amount: "1", tokenSymbol: "ETH", usdValue: 1, formattedUsd: "$1" },
    minWager: { amount: "1", tokenSymbol: "ETH", usdValue: 1, formattedUsd: "$1" },
    endTime: 1,
    timeRemaining: 0,
    settled: false,
    active: true,
  });

  it("replaces the lobby with a well-formed snapshot", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.games, [row(9)]);
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: [row(1)] } }));
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([row(1)]);
  });

  it("ignores a snapshot whose games is not an array, and keeps what it had", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.games, [{ gameId: "kept" }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: {} } }));
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: "no" } }));
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: null }));
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([{ gameId: "kept" }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // Captured from the production hub on 2026-09-09 during game 416. The hub
  // describes a game in the contract's shape, wei strings and all, which is
  // exactly what the chain reader produces. Those rows belong in the chain
  // games cache, where mergeGames prices them; dropping them left the lobby
  // saying "no games" from the socket and relying on the 8 s chain poll.
  const HUB_ROW = {
    minWagerWei: "200683125358721",
    endTime: 1788948057,
    king: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
    timeRemaining: 56,
    gameId: 416,
    active: true,
    starter: "0x6Fe0c92D880678F86a7d213695757ed58B09877F",
    potWei: "200683125358721",
    settled: false,
  };

  it("keeps the hub's contract-shaped rows as chain games", () => {
    const client = new QueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "activeGames",
        topic: "vault:king-of-night",
        data: { games: [HUB_ROW] },
        revision: 17181,
      })
    );
    expect(client.getQueryData(VAULT_KEYS.chainGames)).toEqual([
      {
        gameId: 416,
        starter: HUB_ROW.starter,
        king: HUB_ROW.king,
        potWei: 200683125358721n,
        minWagerWei: 200683125358721n,
        endTime: 1788948057,
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("an empty hub snapshot clears the chain games too", () => {
    const client = new QueryClient();
    client.setQueryData(VAULT_KEYS.chainGames, [{ gameId: 415 }]);
    handleVaultFrame(client, JSON.stringify({ type: "activeGames", data: { games: [] } }));
    expect(client.getQueryData(VAULT_KEYS.chainGames)).toEqual([]);
    expect(client.getQueryData(VAULT_KEYS.games)).toEqual([]);
  });

  it("sorts each row into the cache its shape belongs to and drops the rest", () => {
    const client = new QueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "activeGames",
        data: { games: [HUB_ROW, row(2), { gameId: 3, potWei: "not-a-number" }] },
      })
    );
    expect(
      (client.getQueryData(VAULT_KEYS.games) as { gameId: number }[]).map((g) => g.gameId)
    ).toEqual([2]);
    expect(
      (client.getQueryData(VAULT_KEYS.chainGames) as { gameId: number }[]).map((g) => g.gameId)
    ).toEqual([416]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores frames that are not JSON", () => {
    const client = new QueryClient();
    expect(() => handleVaultFrame(client, "not json")).not.toThrow();
  });
});
