import { describe, expect, it } from "vitest";
import type { User } from "@privy-io/react-auth";
import {
  deriveProfile,
  getEmbeddedWallets,
  getWalletAddress,
  hasEmbeddedWallet,
  isWalletDelegated,
} from "./user";

describe("user wallet helpers", () => {
  const mockUserWithDelegatedWallets = {
    id: "did:privy:user123",
    linkedAccounts: [
      {
        type: "wallet",
        walletClientType: "privy",
        chainType: "ethereum",
        address: "0x1234567890abcdef1234567890abcdef12345678",
        delegated: true,
        id: "server-wallet-eth-1",
      },
      {
        type: "wallet",
        walletClientType: "privy",
        chainType: "solana",
        address: "So11111111111111111111111111111111111111112",
        delegated: false,
        id: null,
      },
      {
        type: "wallet",
        walletClientType: "metamask",
        chainType: "ethereum",
        address: "0x9999999999999999999999999999999999999999",
        delegated: false,
      },
    ],
  } as unknown as User;

  it("identifies whether a specific embedded chain wallet is delegated", () => {
    expect(isWalletDelegated(mockUserWithDelegatedWallets, "ethereum")).toBe(true);
    expect(isWalletDelegated(mockUserWithDelegatedWallets, "solana")).toBe(false);
  });

  it("returns false if the user has no embedded wallet for the requested chain", () => {
    const emptyUser = {
      id: "did:privy:empty",
      linkedAccounts: [],
    } as unknown as User;
    expect(isWalletDelegated(emptyUser, "ethereum")).toBe(false);
  });

  it("extracts embedded wallets with delegation metadata", () => {
    const wallets = getEmbeddedWallets(mockUserWithDelegatedWallets);
    expect(wallets).toHaveLength(2);
    expect(wallets[0]).toEqual({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      chainType: "ethereum",
      delegated: true,
      id: "server-wallet-eth-1",
    });
    expect(wallets[1]).toEqual({
      address: "So11111111111111111111111111111111111111112",
      chainType: "solana",
      delegated: false,
      id: null,
    });
  });

  it("hasEmbeddedWallet detects privy embedded wallets", () => {
    expect(hasEmbeddedWallet(mockUserWithDelegatedWallets, "ethereum")).toBe(true);
    expect(hasEmbeddedWallet(mockUserWithDelegatedWallets, "solana")).toBe(true);
  });

  it("getWalletAddress retrieves address by chain type", () => {
    expect(getWalletAddress(mockUserWithDelegatedWallets, "ethereum")).toBe(
      "0x1234567890abcdef1234567890abcdef12345678"
    );
    expect(getWalletAddress(mockUserWithDelegatedWallets, "solana")).toBe(
      "So11111111111111111111111111111111111111112"
    );
  });

  it("derives user profile safely", () => {
    const profile = deriveProfile(mockUserWithDelegatedWallets);
    expect(profile.name).toBe("World Street user");
  });
});
