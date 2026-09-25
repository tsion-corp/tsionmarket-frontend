import { describe, expect, it } from "vitest";
import { isProxiedVaultRead, isProxiedVaultWrite } from "./vault-proxy-paths";

const TX = `0x${"a".repeat(64)}`;

describe("isProxiedVaultWrite", () => {
  it("forwards the two writes the app makes", () => {
    expect(isProxiedVaultWrite("transactions")).toBe(true);
    expect(isProxiedVaultWrite("games/metadata")).toBe(true);
  });

  // The admin surface settles games and moves money. Nothing here may reach
  // it, and a widened regex is the way that happens by accident.
  it("forwards nothing else", () => {
    for (const path of [
      "games",
      "games/1",
      "config",
      "admin",
      "admin/settle",
      "games/metadata/1",
      "games/1/metadata",
      "metadata",
      "",
    ]) {
      expect(isProxiedVaultWrite(path), `POST ${path} must not be forwarded`).toBe(false);
    }
  });
});

describe("isProxiedVaultRead", () => {
  it("forwards the game reads", () => {
    expect(isProxiedVaultRead("games")).toBe(true);
    expect(isProxiedVaultRead("games/244")).toBe(true);
    expect(isProxiedVaultRead("games/244/activities")).toBe(true);
    expect(isProxiedVaultRead("config")).toBe(true);
    expect(isProxiedVaultRead(`transactions/${TX}`)).toBe(true);
    expect(isProxiedVaultRead(`players/0x${"1".repeat(40)}`)).toBe(true);
  });

  it("refuses a malformed hash or address rather than passing it upstream", () => {
    expect(isProxiedVaultRead("transactions/nope")).toBe(false);
    expect(isProxiedVaultRead("players/nope")).toBe(false);
  });

  it("does not expose the service's own health or docs", () => {
    expect(isProxiedVaultRead("health")).toBe(false);
    expect(isProxiedVaultRead("openapi.json")).toBe(false);
  });
});
