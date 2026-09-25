import { describe, expect, it, vi } from "vitest";
import { createAuthTokenResolver } from "@/lib/auth-token";

const PRIVY = { accessToken: "privy-access", idToken: "privy-id" };
const NONE = { accessToken: null, idToken: null };

describe("createAuthTokenResolver", () => {
  it("prefers the Decane token for the current identity when both sessions are live", async () => {
    const resolvePrivyTokens = vi.fn(async () => PRIVY);
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens,
      getDecaneToken: () => "decane-access",
      hasDecaneSource: () => true,
    });

    await expect(resolve()).resolves.toEqual({ accessToken: "decane-access", idToken: null });
    expect(resolvePrivyTokens).not.toHaveBeenCalled();
  });

  it("yields no token for the current identity when Decane is mounted but signed out", async () => {
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens: async () => PRIVY,
      getDecaneToken: () => null,
      hasDecaneSource: () => true,
    });

    await expect(resolve("current")).resolves.toEqual(NONE);
  });

  it("falls back to Privy for the current identity when no Decane source is registered", async () => {
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens: async () => PRIVY,
      getDecaneToken: () => null,
      hasDecaneSource: () => false,
    });

    await expect(resolve()).resolves.toEqual(PRIVY);
  });

  it("returns only Privy tokens for the legacy identity, ignoring Decane", async () => {
    const getDecaneToken = vi.fn(() => "decane-access");
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens: async () => PRIVY,
      getDecaneToken,
      hasDecaneSource: () => true,
    });

    await expect(resolve("legacy")).resolves.toEqual(PRIVY);
    expect(getDecaneToken).not.toHaveBeenCalled();
  });

  it("yields no token for the legacy identity without a Privy session", async () => {
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens: async () => NONE,
      getDecaneToken: () => "decane-access",
      hasDecaneSource: () => true,
    });

    await expect(resolve("legacy")).resolves.toEqual(NONE);
  });

  it("treats a throwing Privy resolver as signed out instead of failing the call", async () => {
    const resolve = createAuthTokenResolver({
      resolvePrivyTokens: async () => {
        throw new Error("PrivyProvider not mounted");
      },
      getDecaneToken: () => null,
      hasDecaneSource: () => false,
    });

    await expect(resolve()).resolves.toEqual(NONE);
    await expect(resolve("legacy")).resolves.toEqual(NONE);
  });
});
