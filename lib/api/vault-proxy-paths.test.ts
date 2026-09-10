import { describe, expect, it } from "vitest";
import { isProxiedVaultRead } from "@/lib/api/vault-proxy-paths";

describe("isProxiedVaultRead", () => {
  it("forwards the lobby, one game, the feeds, the config and a wallet's standing", () => {
    for (const path of [
      "games",
      "games/421",
      "game/winners",
      "game/activities",
      "config",
      "players/0xb381bBC996fa0e326A4a81a881573fB501bD8AAE",
    ]) {
      expect(isProxiedVaultRead(path), path).toBe(true);
    }
  });

  it("refuses everything else", () => {
    for (const path of [
      "health",
      "openapi.json",
      "chain-games",
      "games/abc",
      "games/421/activities",
      "players/not-an-address",
      "players/",
      "transactions/0xabc",
    ]) {
      expect(isProxiedVaultRead(path), path).toBe(false);
    }
  });
});
