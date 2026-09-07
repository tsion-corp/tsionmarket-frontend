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

  it("drops rows in the vault's domain shape, which have no pot to render", () => {
    const client = new QueryClient();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleVaultFrame(
      client,
      JSON.stringify({
        type: "activeGames",
        data: {
          games: [{ gameId: 1, potWei: "1", minWagerWei: "1", endTime: 1 }, row(2)],
        },
      })
    );
    expect(
      (client.getQueryData(VAULT_KEYS.games) as { gameId: number }[]).map((g) => g.gameId)
    ).toEqual([2]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores frames that are not JSON", () => {
    const client = new QueryClient();
    expect(() => handleVaultFrame(client, "not json")).not.toThrow();
  });
});
