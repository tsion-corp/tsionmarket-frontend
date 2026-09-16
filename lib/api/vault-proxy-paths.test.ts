import { describe, expect, it } from "vitest";
import { isProxiedVaultRead, isProxiedVaultWrite } from "@/lib/api/vault-proxy-paths";

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
      // games/:id/activities used to be refused. v5 splits a game's own feed
      // out of the global one and the app reads it, so it is allowed now and
      // is covered in "v5 read and write paths" below.
      "games/421/activities/extra",
      "players/not-an-address",
      "players/",
      // Still refused: a transaction path has to carry a real 32-byte hash.
      "transactions/0xabc",
    ]) {
      expect(isProxiedVaultRead(path), path).toBe(false);
    }
  });
});

// v5's client contract adds two surfaces the allowlist did not know about:
// a game's own activity feed, and handing the service a transaction hash so it
// can tell us what that transaction turned out to be. Without the second we
// are back to polling receipts and decoding GameStarted for our own gameId.
describe("v5 read and write paths", () => {
  it("forwards one game's activity feed", () => {
    expect(isProxiedVaultRead("games/12/activities")).toBe(true);
    expect(isProxiedVaultRead("games/12/activities/extra")).toBe(false);
    expect(isProxiedVaultRead("games/abc/activities")).toBe(false);
  });

  it("forwards a transaction lookup by hash", () => {
    expect(isProxiedVaultRead(`transactions/0x${"a".repeat(64)}`)).toBe(true);
    expect(isProxiedVaultRead("transactions/not-a-hash")).toBe(false);
  });

  // Handing over a hash is the only write, and it is the only one: a POST to
  // anything else is not ours to forward.
  it("allows posting a hash and nothing else", () => {
    expect(isProxiedVaultWrite("transactions")).toBe(true);
    expect(isProxiedVaultWrite("games")).toBe(false);
    expect(isProxiedVaultWrite("admin/tokens")).toBe(false);
  });
});
