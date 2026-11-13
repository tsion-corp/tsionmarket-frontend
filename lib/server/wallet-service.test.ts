import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { walletPath } from "./wallet-service";

describe("walletPath", () => {
  it("maps the calls the client makes", () => {
    expect(walletPath("GET", ["me"])).toBe("/wallets/me");
    expect(walletPath("POST", [])).toBe("/wallets");
    expect(walletPath("POST", ["restore"])).toBe("/wallets/restore");
    expect(walletPath("POST", ["me", "challenges"])).toBe("/wallets/me/challenges");
    expect(walletPath("PUT", ["me", "package"])).toBe("/wallets/me/package");
    expect(walletPath("POST", ["me", "devices"])).toBe("/wallets/me/devices");
    expect(walletPath("DELETE", ["me", "devices", "device-1"])).toBe(
      "/wallets/me/devices/device-1"
    );
  });

  it("refuses the wrong method, unknown routes and the internal ones", () => {
    expect(walletPath("DELETE", ["me"])).toBeNull();
    expect(walletPath("GET", ["me", "package"])).toBeNull();
    expect(walletPath("POST", ["me", "package"])).toBeNull();
    expect(walletPath("GET", ["internal", "users", "x", "wallet-addresses"])).toBeNull();
    expect(walletPath("GET", ["health"])).toBeNull();
    expect(walletPath("POST", ["me", "devices", "d"])).toBeNull();
    expect(walletPath("GET", ["restore"])).toBeNull();
    expect(walletPath("PUT", ["restore"])).toBeNull();
  });

  it("refuses anything that could climb out of the path", () => {
    for (const bad of [
      ["..", "me"],
      ["me", ".."],
      ["me/", "devices"],
      ["me", "devices", "a/b"],
      ["me", "devices", "a b"],
      ["%2e%2e"],
      ["me", "devices", ""],
    ]) {
      expect(walletPath("GET", bad)).toBeNull();
      expect(walletPath("DELETE", bad)).toBeNull();
    }
  });
});
