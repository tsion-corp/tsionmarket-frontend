import { describe, expect, it } from "vitest";
import { matchDepositChain } from "@/lib/voice/chain-match";
import type { DepositChain } from "@/lib/deposit";

// A stand-in for Dextopus's live chain list (name is what we match on).
const chain = (chainId: number, name: string): DepositChain => ({
  chainId,
  name,
  nativeSymbol: "",
  nativeDecimals: 18,
  logoUrl: null,
  blockExplorer: null,
});

const CHAINS: DepositChain[] = [
  chain(1, "Ethereum"),
  chain(8453, "Base"),
  chain(792703809, "Solana"),
  chain(42161, "Arbitrum One"),
  chain(137, "Polygon"),
];

describe("matchDepositChain", () => {
  it("matches an exact spoken name", () => {
    expect(matchDepositChain("solana", CHAINS)?.chainId).toBe(792703809);
  });

  it("resolves aliases (eth → Ethereum, matic → Polygon)", () => {
    expect(matchDepositChain("eth", CHAINS)?.chainId).toBe(1);
    expect(matchDepositChain("matic", CHAINS)?.chainId).toBe(137);
  });

  it("matches a partial name (arbitrum → Arbitrum One)", () => {
    expect(matchDepositChain("arbitrum", CHAINS)?.chainId).toBe(42161);
  });

  it("is case-insensitive and trims", () => {
    expect(matchDepositChain("  BASE ", CHAINS)?.chainId).toBe(8453);
  });

  it("returns null for a chain not in the live list", () => {
    expect(matchDepositChain("zksync", CHAINS)).toBeNull();
  });

  it("returns null when the list has not loaded", () => {
    expect(matchDepositChain("solana", undefined)).toBeNull();
  });
});
