import { describe, expect, it } from "vitest";
import { isWalletlessLegacyAccount, type WalletlessInput } from "@/features/migrate/lib/walletless";

const signedIn: WalletlessInput = {
  fresh: true,
  ready: true,
  authenticated: true,
  hasUser: true,
  embeddedWallets: 0,
  mismatch: false,
  legacyAccountKnown: true,
};

describe("isWalletlessLegacyAccount", () => {
  it("is an old account the directory knows, signed in, with no wallet to move", () => {
    expect(isWalletlessLegacyAccount(signedIn)).toBe(true);
  });

  it("is not an account that has a wallet: that one goes through discovery", () => {
    expect(isWalletlessLegacyAccount({ ...signedIn, embeddedWallets: 1 })).toBe(false);
  });

  it("is not an account nobody has heard of: a mistyped email must not be linked", () => {
    expect(isWalletlessLegacyAccount({ ...signedIn, legacyAccountKnown: false })).toBe(false);
  });

  it("is not somebody else's old account, nor a session still being cleared", () => {
    expect(isWalletlessLegacyAccount({ ...signedIn, mismatch: true })).toBe(false);
    expect(isWalletlessLegacyAccount({ ...signedIn, fresh: false })).toBe(false);
    expect(isWalletlessLegacyAccount({ ...signedIn, ready: false })).toBe(false);
    expect(isWalletlessLegacyAccount({ ...signedIn, authenticated: false })).toBe(false);
    expect(isWalletlessLegacyAccount({ ...signedIn, hasUser: false })).toBe(false);
  });
});
