import { describe, expect, it } from "vitest";
import { isWalletWindowError } from "@/features/migrate/lib/wallet-window";

describe("isWalletWindowError", () => {
  // Privy's own two strings, as raised.
  it("recognises the wallet iframe not being there", () => {
    expect(isWalletWindowError("iframe not initialized")).toBe(true);
    expect(isWalletWindowError("Privy iframe failed to load: timeout")).toBe(true);
    expect(isWalletWindowError("Error: Iframe did not initialize")).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isWalletWindowError("insufficient funds for gas")).toBe(false);
    expect(isWalletWindowError("ERC20: transfer amount exceeds balance")).toBe(false);
    expect(isWalletWindowError("Your old wallet is not connected. Sign in again.")).toBe(false);
    expect(isWalletWindowError("")).toBe(false);
    expect(isWalletWindowError(null)).toBe(false);
  });
});
